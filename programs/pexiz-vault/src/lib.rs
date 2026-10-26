use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use canary_venue::program::CanaryVenue;
use canary_venue::Pool;
use pexiz_oracle::{Flag, Venue};

pub mod math;

declare_id!("3WXGqGargd6Wig3czzD45kstziZGhQdQ5HYYdNJkJGnz");

/// Hard cap on assets under management in v1, set by measured exit capacity
/// (JLP sells at 0.64% impact for $10M and 6.7% for $20M, 26 Oct 2026).
pub const AUM_CAP_USDC: u64 = 10_000_000 * 1_000_000;

#[program]
pub mod pexiz_vault {
    use super::*;

    /// Creates a vault bound to one oracle venue and one canary pool. One
    /// vault per venue; the first caller wins.
    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        require_keys_eq!(ctx.accounts.venue.params_program, canary_venue::ID, VaultError::VenueMismatch);
        let v = &mut ctx.accounts.vault;
        v.venue = ctx.accounts.venue.key();
        v.pool = ctx.accounts.pool.key();
        v.usdc_mint = ctx.accounts.pool.usdc_mint;
        v.lp_mint = ctx.accounts.pool.lp_mint;
        v.share_mint = ctx.accounts.share_mint.key();
        v.vault_usdc = ctx.accounts.vault_usdc.key();
        v.vault_lp = ctx.accounts.vault_lp.key();
        v.share_escrow = ctx.accounts.share_escrow.key();
        v.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Deposit USDC; the vault buys the venue LP token. Refused unless the
    /// venue flag is green and the AUM cap holds.
    pub fn deposit(ctx: Context<Deposit>, usdc_amount: u64, min_lp_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(usdc_amount > 0, VaultError::ZeroAmount);
        require!(!a.vault.exited, VaultError::AlreadyExited);
        require!(a.venue.flag == Flag::Green, VaultError::VenueNotGreen);
        let nav = a.vault_usdc.amount.checked_add(a.vault_lp.amount).ok_or(VaultError::Overflow)?;
        require!(nav.checked_add(usdc_amount).ok_or(VaultError::Overflow)? <= AUM_CAP_USDC, VaultError::AumCap);
        let shares = math::shares_for_deposit(usdc_amount, nav, a.share_mint.supply).ok_or(VaultError::EmptyVault)?;
        require!(shares > 0, VaultError::ZeroAmount);

        token::transfer(
            CpiContext::new(
                a.token_program.to_account_info(),
                Transfer {
                    from: a.user_usdc.to_account_info(),
                    to: a.vault_usdc.to_account_info(),
                    authority: a.user.to_account_info(),
                },
            ),
            usdc_amount,
        )?;
        let lp_before = a.vault_lp.amount;
        swap_usdc_to_lp(&a.vault, &a.pool, &a.pool_lp_mint, &a.pool_reserve, &a.vault_usdc, &a.vault_lp, &a.token_program, &a.canary_program, usdc_amount)?;
        ctx.accounts.vault_lp.reload()?;
        let a = &ctx.accounts;
        require!(a.vault_lp.amount - lp_before >= min_lp_out, VaultError::Slippage);

        token::mint_to(
            CpiContext::new_with_signer(
                a.token_program.to_account_info(),
                MintTo {
                    mint: a.share_mint.to_account_info(),
                    to: a.user_shares.to_account_info(),
                    authority: a.vault.to_account_info(),
                },
                &[&a.vault.seeds()],
            ),
            shares,
        )?;
        Ok(())
    }

    /// Withdraw pro-rata: the share of every token the vault holds (LP
    /// before an exit, USDC after). Always open, whatever the flag.
    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(shares > 0, VaultError::ZeroAmount);
        let supply = a.share_mint.supply;
        let usdc_out = math::pro_rata(a.vault_usdc.amount, shares, supply);
        let lp_out = math::pro_rata(a.vault_lp.amount, shares, supply);
        token::burn(
            CpiContext::new(
                a.token_program.to_account_info(),
                Burn {
                    mint: a.share_mint.to_account_info(),
                    from: a.user_shares.to_account_info(),
                    authority: a.user.to_account_info(),
                },
            ),
            shares,
        )?;
        let seeds = a.vault.seeds();
        for (from, to, amount) in [(&a.vault_usdc, &a.user_usdc, usdc_out), (&a.vault_lp, &a.user_lp, lp_out)] {
            if amount == 0 {
                continue;
            }
            token::transfer(
                CpiContext::new_with_signer(
                    a.token_program.to_account_info(),
                    Transfer {
                        from: from.to_account_info(),
                        to: to.to_account_info(),
                        authority: a.vault.to_account_info(),
                    },
                    &[&seeds],
                ),
                amount,
            )?;
        }
        Ok(())
    }

    /// Permissionless. Reads the oracle venue account; if the flag is red,
    /// redeems all LP tokens to USDC and marks the vault exited. Designed to be
    /// called in the same transaction as the oracle update that turns it red.
    pub fn exit(ctx: Context<Exit>, min_usdc_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(!a.vault.exited, VaultError::AlreadyExited);
        require!(a.venue.flag == Flag::Red, VaultError::VenueNotRed);
        let lp = a.vault_lp.amount;
        let usdc_before = a.vault_usdc.amount;
        if lp > 0 {
            canary_venue::cpi::remove_liquidity(
                CpiContext::new_with_signer(
                    a.canary_program.to_account_info(),
                    canary_venue::cpi::accounts::RemoveLiquidity {
                        pool: a.pool.to_account_info(),
                        lp_mint: a.pool_lp_mint.to_account_info(),
                        usdc_reserve: a.pool_reserve.to_account_info(),
                        user_usdc: a.vault_usdc.to_account_info(),
                        user_lp: a.vault_lp.to_account_info(),
                        user: a.vault.to_account_info(),
                        token_program: a.token_program.to_account_info(),
                    },
                    &[&a.vault.seeds()],
                ),
                lp,
            )?;
        }
        ctx.accounts.vault_usdc.reload()?;
        let out = ctx.accounts.vault_usdc.amount - usdc_before;
        require!(out >= min_usdc_out, VaultError::Slippage);
        let clock = Clock::get()?;
        let v = &mut ctx.accounts.vault;
        v.exited = true;
        v.exited_at_slot = clock.slot;
        v.exits += 1;
        emit!(VaultExited { vault: v.key(), venue: v.venue, lp_redeemed: lp, usdc_out: out, slot: clock.slot });
        Ok(())
    }

    /// Escrows the caller's shares as a vote to re-enter after an exit.
    pub fn vote_reenter(ctx: Context<VoteReenter>, shares: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(a.vault.exited, VaultError::NotExited);
        require!(shares > 0, VaultError::ZeroAmount);
        token::transfer(
            CpiContext::new(
                a.token_program.to_account_info(),
                Transfer {
                    from: a.user_shares.to_account_info(),
                    to: a.share_escrow.to_account_info(),
                    authority: a.user.to_account_info(),
                },
            ),
            shares,
        )?;
        let vault = &mut ctx.accounts.vault;
        let rec = &mut ctx.accounts.vote;
        if rec.shares > 0 && rec.round != vault.exits {
            // A vote left over from an earlier exit no longer counts.
            rec.counted = 0;
        }
        rec.vault = vault.key();
        rec.voter = ctx.accounts.user.key();
        rec.round = vault.exits;
        rec.shares += shares;
        rec.counted += shares;
        rec.bump = ctx.bumps.vote;
        vault.reentry_votes += shares;
        Ok(())
    }

    /// Returns escrowed shares; withdraws the vote if it still counts.
    pub fn unvote(ctx: Context<Unvote>) -> Result<()> {
        let a = &ctx.accounts;
        let shares = a.vote.shares;
        require!(shares > 0, VaultError::ZeroAmount);
        token::transfer(
            CpiContext::new_with_signer(
                a.token_program.to_account_info(),
                Transfer {
                    from: a.share_escrow.to_account_info(),
                    to: a.user_shares.to_account_info(),
                    authority: a.vault.to_account_info(),
                },
                &[&a.vault.seeds()],
            ),
            shares,
        )?;
        let vault = &mut ctx.accounts.vault;
        let rec = &mut ctx.accounts.vote;
        if vault.exited && rec.round == vault.exits {
            vault.reentry_votes -= rec.counted;
        }
        rec.shares = 0;
        rec.counted = 0;
        Ok(())
    }

    /// Re-enter after the venue is green again (which implies the oracle
    /// cool-off) and at least half of all shares voted for it.
    pub fn reenter(ctx: Context<Reenter>, min_lp_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(a.vault.exited, VaultError::NotExited);
        require!(a.venue.flag == Flag::Green, VaultError::VenueNotGreen);
        require!(math::majority(a.vault.reentry_votes, a.share_mint.supply), VaultError::ReentryNotAllowed);
        let usdc = a.vault_usdc.amount;
        let lp_before = a.vault_lp.amount;
        if usdc > 0 {
            swap_usdc_to_lp(&a.vault, &a.pool, &a.pool_lp_mint, &a.pool_reserve, &a.vault_usdc, &a.vault_lp, &a.token_program, &a.canary_program, usdc)?;
        }
        ctx.accounts.vault_lp.reload()?;
        require!(ctx.accounts.vault_lp.amount - lp_before >= min_lp_out, VaultError::Slippage);
        let v = &mut ctx.accounts.vault;
        v.exited = false;
        v.reentry_votes = 0;
        Ok(())
    }
}

#[allow(clippy::too_many_arguments)]
fn swap_usdc_to_lp<'info>(
    vault: &Account<'info, Vault>,
    pool: &Account<'info, Pool>,
    pool_lp_mint: &Account<'info, Mint>,
    pool_reserve: &Account<'info, TokenAccount>,
    vault_usdc: &Account<'info, TokenAccount>,
    vault_lp: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    canary_program: &Program<'info, CanaryVenue>,
    amount: u64,
) -> Result<()> {
    canary_venue::cpi::add_liquidity(
        CpiContext::new_with_signer(
            canary_program.to_account_info(),
            canary_venue::cpi::accounts::AddLiquidity {
                pool: pool.to_account_info(),
                lp_mint: pool_lp_mint.to_account_info(),
                usdc_reserve: pool_reserve.to_account_info(),
                user_usdc: vault_usdc.to_account_info(),
                user_lp: vault_lp.to_account_info(),
                user: vault.to_account_info(),
                token_program: token_program.to_account_info(),
            },
            &[&vault.seeds()],
        ),
        amount,
    )
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub venue: Pubkey,
    pub pool: Pubkey,
    pub lp_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub share_mint: Pubkey,
    pub vault_usdc: Pubkey,
    pub vault_lp: Pubkey,
    pub share_escrow: Pubkey,
    pub exited: bool,
    pub exited_at_slot: u64,
    /// Number of exits so far; also the current re-entry voting round.
    pub exits: u32,
    pub reentry_votes: u64,
    pub bump: u8,
}

impl Vault {
    pub fn seeds(&self) -> [&[u8]; 3] {
        [b"vault", self.venue.as_ref(), std::slice::from_ref(&self.bump)]
    }
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub vault: Pubkey,
    pub voter: Pubkey,
    pub round: u32,
    /// Shares held in escrow for this voter.
    pub shares: u64,
    /// Shares counted toward the current round.
    pub counted: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(init, payer = payer, space = 8 + Vault::INIT_SPACE, seeds = [b"vault", venue.key().as_ref()], bump)]
    pub vault: Box<Account<'info, Vault>>,
    pub venue: Box<Account<'info, Venue>>,
    pub pool: Box<Account<'info, Pool>>,
    #[account(address = pool.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(address = pool.lp_mint)]
    pub lp_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = payer, seeds = [b"shares", vault.key().as_ref()], bump, mint::decimals = usdc_mint.decimals, mint::authority = vault)]
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = payer, seeds = [b"usdc", vault.key().as_ref()], bump, token::mint = usdc_mint, token::authority = vault)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = payer, seeds = [b"lp", vault.key().as_ref()], bump, token::mint = lp_mint, token::authority = vault)]
    pub vault_lp: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = payer, seeds = [b"escrow", vault.key().as_ref()], bump, token::mint = share_mint, token::authority = vault)]
    pub share_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(has_one = venue, has_one = pool, has_one = share_mint, has_one = vault_usdc, has_one = vault_lp)]
    pub vault: Box<Account<'info, Vault>>,
    pub venue: Box<Account<'info, Venue>>,
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, address = pool.lp_mint)]
    pub pool_lp_mint: Box<Account<'info, Mint>>,
    #[account(mut, address = pool.usdc_reserve)]
    pub pool_reserve: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_lp: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = vault.usdc_mint)]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint)]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub canary_program: Program<'info, CanaryVenue>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(has_one = share_mint, has_one = vault_usdc, has_one = vault_lp)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_lp: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint)]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = vault.usdc_mint)]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = vault.lp_mint)]
    pub user_lp: Box<Account<'info, TokenAccount>>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Exit<'info> {
    #[account(mut, has_one = venue, has_one = pool, has_one = vault_usdc, has_one = vault_lp)]
    pub vault: Box<Account<'info, Vault>>,
    pub venue: Box<Account<'info, Venue>>,
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, address = pool.lp_mint)]
    pub pool_lp_mint: Box<Account<'info, Mint>>,
    #[account(mut, address = pool.usdc_reserve)]
    pub pool_reserve: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_lp: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub canary_program: Program<'info, CanaryVenue>,
}

#[derive(Accounts)]
pub struct VoteReenter<'info> {
    #[account(mut, has_one = share_escrow, has_one = share_mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [b"vote", vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub vote: Box<Account<'info, VoteRecord>>,
    #[account(mut)]
    pub share_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint)]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unvote<'info> {
    #[account(mut, has_one = share_escrow, has_one = share_mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"vote", vault.key().as_ref(), user.key().as_ref()], bump = vote.bump)]
    pub vote: Box<Account<'info, VoteRecord>>,
    #[account(mut)]
    pub share_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint)]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Reenter<'info> {
    #[account(mut, has_one = venue, has_one = pool, has_one = share_mint, has_one = vault_usdc, has_one = vault_lp)]
    pub vault: Box<Account<'info, Vault>>,
    pub venue: Box<Account<'info, Venue>>,
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, address = pool.lp_mint)]
    pub pool_lp_mint: Box<Account<'info, Mint>>,
    #[account(mut, address = pool.usdc_reserve)]
    pub pool_reserve: Box<Account<'info, TokenAccount>>,
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_lp: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub canary_program: Program<'info, CanaryVenue>,
}

#[event]
pub struct VaultExited {
    pub vault: Pubkey,
    pub venue: Pubkey,
    pub lp_redeemed: u64,
    pub usdc_out: u64,
    pub slot: u64,
}

#[error_code]
pub enum VaultError {
    #[msg("venue flag is not green")]
    VenueNotGreen,
    #[msg("venue flag is not red")]
    VenueNotRed,
    #[msg("deposit would exceed the AUM cap")]
    AumCap,
    #[msg("vault already exited")]
    AlreadyExited,
    #[msg("cool-off or re-entry vote not satisfied")]
    ReentryNotAllowed,
    #[msg("vault has not exited")]
    NotExited,
    #[msg("amount must be positive")]
    ZeroAmount,
    #[msg("output below the minimum")]
    Slippage,
    #[msg("vault holds shares but no assets")]
    EmptyVault,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("venue does not watch the canary venue program")]
    VenueMismatch,
}
