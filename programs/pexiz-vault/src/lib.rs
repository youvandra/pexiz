use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use canary_venue::program::CanaryVenue;
use canary_venue::Pool;
use pexiz_oracle::{Flag, Venue};

pub mod math;

declare_id!("3WXGqGargd6Wig3czzD45kstziZGhQdQ5HYYdNJkJGnz");

/// Hard cap on assets under management in v1, set by measured exit capacity
/// (JLP sells at 0.64% impact for $10M and 6.7% for $20M, 26 Oct 2026).
pub const AUM_CAP_USDC: u64 = 10_000_000 * 1_000_000;
/// Worst price an exit tranche may take, below the pool's value per LP token.
pub const MAX_EXIT_SLIPPAGE_BPS: u64 = 100;

/// Jupiter Perps, whose JLP pool is the first live venue the vault can hold.
pub const JUPITER_PERPS_ID: Pubkey = pubkey!("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu");
/// The one LP token a vault may hold in v1. Its exit capacity is the measured
/// one behind `AUM_CAP_USDC`, so another pool's token would carry a cap that
/// was never measured for it.
pub const JLP_MINT: Pubkey = pubkey!("27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4");
/// `remove_liquidity2 { lp_amount_in, min_amount_out }`: the Anchor
/// discriminator, `sha256("global:remove_liquidity2")[..8]`.
pub const REMOVE_LIQUIDITY2: [u8; 8] = [230, 215, 82, 127, 241, 101, 227, 146];
/// `add_liquidity2 { token_amount_in, min_lp_amount_out, token_amount_pre_swap }`.
const ADD_LIQUIDITY2: [u8; 8] = [228, 162, 78, 28, 70, 219, 116, 115];
/// Where a Jupiter Perps `Custody` account keeps the pool it belongs to and
/// the token it holds. Read from the live custodies on 27 Oct 2026;
/// `tests/fork/jlp.test.ts` fails if either moves.
const CUSTODY_POOL_OFFSET: usize = 8;
const CUSTODY_MINT_OFFSET: usize = 40;
/// Where the Jupiter Perps `Pool` account keeps `aum_usd`, a u128 with six
/// decimals. Read from the live pool on 27 Oct 2026 and checked against a
/// redemption on a mainnet fork: 844,315,343,474,555 over a supply of
/// 189,042,592,013,553 is $4.4663 per JLP, and 1,000 JLP fetched $4,455.
/// `tests/fork/jlp.test.ts` fails if it moves.
pub const JLP_POOL_AUM_OFFSET: usize = 212;

#[program]
pub mod pexiz_vault {
    use super::*;

    /// Creates a vault bound to one oracle venue and one canary pool. One
    /// vault per venue; the first caller wins.
    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        let watched = ctx.accounts.venue.params_program;
        require!(
            watched == canary_venue::ID || watched == pexiz_oracle::FAST_CANARY_PROGRAM,
            VaultError::VenueMismatch
        );
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

    /// Creates a vault that holds JLP, bound to one oracle venue watching
    /// Jupiter Perps. The pool and the custody the vault takes its USDC out of
    /// are checked against each other on chain, so the vault cannot be pointed
    /// at a pool that does not hold the token it claims.
    pub fn init_jlp_vault(ctx: Context<InitJlpVault>) -> Result<()> {
        let a = &ctx.accounts;
        require_keys_eq!(a.venue.params_program, JUPITER_PERPS_ID, VaultError::VenueMismatch);
        let custody = a.usdc_custody.try_borrow_data()?;
        require!(custody.len() >= CUSTODY_MINT_OFFSET + 32, VaultError::NotJupiterPool);
        require_keys_eq!(
            Pubkey::try_from(&custody[CUSTODY_POOL_OFFSET..CUSTODY_POOL_OFFSET + 32]).unwrap(),
            a.jlp_pool.key(),
            VaultError::NotJupiterPool
        );
        require_keys_eq!(
            Pubkey::try_from(&custody[CUSTODY_MINT_OFFSET..CUSTODY_MINT_OFFSET + 32]).unwrap(),
            a.usdc_mint.key(),
            VaultError::NotJupiterPool
        );
        drop(custody);
        // The pool has to be able to price itself before anyone deposits.
        require!(jlp_aum_usdc(&a.jlp_pool)? > 0, VaultError::NotJupiterPool);

        let v = &mut ctx.accounts.vault;
        v.venue = ctx.accounts.venue.key();
        v.pool = ctx.accounts.jlp_pool.key();
        v.usdc_mint = ctx.accounts.usdc_mint.key();
        v.lp_mint = ctx.accounts.lp_mint.key();
        v.share_mint = ctx.accounts.share_mint.key();
        v.vault_usdc = ctx.accounts.vault_usdc.key();
        v.vault_lp = ctx.accounts.vault_lp.key();
        v.share_escrow = ctx.accounts.share_escrow.key();
        v.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Deposit USDC into a JLP vault; the vault buys JLP from Jupiter itself.
    /// The same guards as `deposit`, with the JLP it already holds valued at
    /// the pool's own AUM per token rather than counted as dollars.
    pub fn deposit_jlp<'info>(ctx: Context<'_, '_, 'info, 'info, DepositJlp<'info>>, usdc_amount: u64, min_lp_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(usdc_amount > 0, VaultError::ZeroAmount);
        require!(!a.vault.exited, VaultError::AlreadyExited);
        require!(a.venue.flag == Flag::Green, VaultError::VenueNotGreen);
        a.jupiter.bound_to(&a.vault)?;
        let nav = jlp_nav(a.jupiter.vault_usdc.amount, a.jupiter.vault_lp.amount, &a.jupiter.jlp_pool, a.jupiter.jlp_mint.supply)?;
        require!(nav.checked_add(usdc_amount).ok_or(VaultError::Overflow)? <= AUM_CAP_USDC, VaultError::AumCap);
        let shares = math::shares_for_deposit(usdc_amount, nav, a.share_mint.supply).ok_or(VaultError::EmptyVault)?;
        require!(shares > 0, VaultError::ZeroAmount);

        token::transfer(
            CpiContext::new(
                a.jupiter.token_program.to_account_info(),
                Transfer {
                    from: a.user_usdc.to_account_info(),
                    to: a.jupiter.vault_usdc.to_account_info(),
                    authority: a.user.to_account_info(),
                },
            ),
            usdc_amount,
        )?;

        let lp_before = a.jupiter.vault_lp.amount;
        let mut data = Vec::with_capacity(25);
        data.extend_from_slice(&ADD_LIQUIDITY2);
        data.extend_from_slice(&usdc_amount.to_le_bytes());
        data.extend_from_slice(&min_lp_out.to_le_bytes());
        data.push(0); // token_amount_pre_swap: None
        jupiter_liquidity_cpi(&a.jupiter, &a.vault, ctx.remaining_accounts, data)?;

        ctx.accounts.jupiter.vault_lp.reload()?;
        let a = &ctx.accounts;
        require!(a.jupiter.vault_lp.amount - lp_before >= min_lp_out, VaultError::Slippage);

        token::mint_to(
            CpiContext::new_with_signer(
                a.jupiter.token_program.to_account_info(),
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

    /// Buys JLP back with everything the vault holds in USDC, once the venue
    /// is green again and a majority of shares has voted for it. The mirror of
    /// `reenter` for a vault that holds JLP.
    pub fn reenter_jlp<'info>(ctx: Context<'_, '_, 'info, 'info, ReenterJlp<'info>>, min_lp_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        a.jupiter.bound_to(&a.vault)?;
        require!(a.vault.exited, VaultError::NotExited);
        require!(a.venue.flag == Flag::Green, VaultError::VenueNotGreen);
        require!(math::majority(a.vault.reentry_votes, a.share_mint.supply), VaultError::ReentryNotAllowed);

        let usdc = a.jupiter.vault_usdc.amount;
        require!(usdc > 0, VaultError::ZeroAmount);
        let lp_before = a.jupiter.vault_lp.amount;
        let mut data = Vec::with_capacity(25);
        data.extend_from_slice(&ADD_LIQUIDITY2);
        data.extend_from_slice(&usdc.to_le_bytes());
        data.extend_from_slice(&min_lp_out.to_le_bytes());
        data.push(0); // token_amount_pre_swap: None
        jupiter_liquidity_cpi(&a.jupiter, &a.vault, ctx.remaining_accounts, data)?;

        ctx.accounts.jupiter.vault_lp.reload()?;
        require!(ctx.accounts.jupiter.vault_lp.amount - lp_before >= min_lp_out, VaultError::Slippage);
        let v = &mut ctx.accounts.vault;
        v.exited = false;
        v.reentry_votes = 0;
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
    /// redeems `lp_amount` of the vault's LP tokens to USDC. Designed to be
    /// called in the same transaction as the oracle update that turns it red.
    ///
    /// The first call marks the vault exited and opens a re-entry round. When
    /// the pool cannot absorb the whole position at once, the rest leaves in
    /// further tranches, in later calls. Each tranche must return at least
    /// `MAX_EXIT_SLIPPAGE_BPS` below the pool's own value per LP token, so a
    /// caller cannot force a fire sale.
    pub fn exit(ctx: Context<Exit>, lp_amount: u64, min_usdc_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(a.venue.flag == Flag::Red, VaultError::VenueNotRed);
        let held = a.vault_lp.amount;
        require!(held > 0, VaultError::AlreadyExited);
        require!(lp_amount > 0 && lp_amount <= held, VaultError::ZeroAmount);
        let floor = math::exit_floor(lp_amount, a.pool_reserve.amount, a.pool_lp_mint.supply).ok_or(VaultError::Overflow)?;
        require!(min_usdc_out >= floor, VaultError::SlippageFloor);
        let usdc_before = a.vault_usdc.amount;
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
            lp_amount,
        )?;
        ctx.accounts.vault_usdc.reload()?;
        let out = ctx.accounts.vault_usdc.amount - usdc_before;
        require!(out >= min_usdc_out, VaultError::Slippage);
        let clock = Clock::get()?;
        let v = &mut ctx.accounts.vault;
        if !v.exited {
            v.exited = true;
            v.exits += 1;
        }
        // Slot of the latest tranche.
        v.exited_at_slot = clock.slot;
        emit!(VaultExited {
            vault: v.key(),
            venue: v.venue,
            lp_redeemed: lp_amount,
            usdc_out: out,
            lp_left: held - lp_amount,
            slot: clock.slot,
        });
        Ok(())
    }

    /// Sell a tranche of JLP for USDC through Jupiter Perps itself, the same
    /// way `exit` sells the canary LP token. The guards are the same, and the
    /// floor is the pool's own AUM per JLP, read from the pool account in this
    /// transaction, so a caller cannot route the vault into a fire sale.
    ///
    /// The accounts after the named ones are passed to Jupiter unchanged: it
    /// values every custody before it prices the LP token. The vault's own
    /// token accounts are named, so the remaining accounts cannot redirect
    /// where the money goes.
    pub fn exit_jlp<'info>(ctx: Context<'_, '_, 'info, 'info, ExitJlp<'info>>, lp_amount: u64, min_usdc_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        a.jupiter.bound_to(&a.vault)?;
        require!(a.venue.flag == Flag::Red, VaultError::VenueNotRed);
        let held = a.jupiter.vault_lp.amount;
        require!(held > 0, VaultError::AlreadyExited);
        require!(lp_amount > 0 && lp_amount <= held, VaultError::ZeroAmount);

        let floor = math::exit_floor(lp_amount, jlp_aum_usdc(&a.jupiter.jlp_pool)?, a.jupiter.jlp_mint.supply)
            .ok_or(VaultError::Overflow)?;
        require!(min_usdc_out >= floor, VaultError::SlippageFloor);

        let usdc_before = a.jupiter.vault_usdc.amount;
        let mut data = Vec::with_capacity(24);
        data.extend_from_slice(&REMOVE_LIQUIDITY2);
        data.extend_from_slice(&lp_amount.to_le_bytes());
        data.extend_from_slice(&min_usdc_out.to_le_bytes());
        jupiter_liquidity_cpi(&a.jupiter, &a.vault, ctx.remaining_accounts, data)?;

        ctx.accounts.jupiter.vault_usdc.reload()?;
        let out = ctx.accounts.jupiter.vault_usdc.amount - usdc_before;
        require!(out >= min_usdc_out, VaultError::Slippage);
        let clock = Clock::get()?;
        let v = &mut ctx.accounts.vault;
        if !v.exited {
            v.exited = true;
            v.exits += 1;
        }
        v.exited_at_slot = clock.slot;
        emit!(VaultExited {
            vault: v.key(),
            venue: v.venue,
            lp_redeemed: lp_amount,
            usdc_out: out,
            lp_left: held - lp_amount,
            slot: clock.slot,
        });
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

/// What the Jupiter Perps pool says it is worth, in USDC units. The field is
/// a u128 with six decimals, the same unit as USDC, so the share math that
/// `exit` uses on the canary reserve works unchanged here.
pub fn jlp_aum_usdc(pool: &UncheckedAccount) -> Result<u64> {
    require_keys_eq!(*pool.owner, JUPITER_PERPS_ID, VaultError::NotJupiterPool);
    let data = pool.try_borrow_data()?;
    let end = JLP_POOL_AUM_OFFSET + 16;
    require!(data.len() >= end, VaultError::NotJupiterPool);
    let aum = u128::from_le_bytes(data[JLP_POOL_AUM_OFFSET..end].try_into().unwrap());
    u64::try_from(aum).map_err(|_| VaultError::Overflow.into())
}

/// What the vault is worth in USDC: the USDC it holds, plus the JLP it holds
/// at the pool's own value per token. Rounds toward the vault.
fn jlp_nav(usdc: u64, lp: u64, pool: &UncheckedAccount, lp_supply: u64) -> Result<u64> {
    let lp_value = math::lp_value_usdc(lp, jlp_aum_usdc(pool)?, lp_supply).ok_or(VaultError::Overflow)?;
    usdc.checked_add(lp_value).ok_or(VaultError::Overflow.into())
}

/// Calls Jupiter Perps with the fourteen accounts it expects, the vault
/// signing as `owner`, and whatever accounts the caller passed after them:
/// the pool values every custody before it prices the LP token.
fn jupiter_liquidity_cpi<'info>(
    j: &JupiterLiquidity<'info>,
    vault: &Account<'info, Vault>,
    rest: &[AccountInfo<'info>],
    data: Vec<u8>,
) -> Result<()> {
    let fixed = [
        (vault.to_account_info(), false, true),
        (j.vault_usdc.to_account_info(), true, false),
        (j.vault_lp.to_account_info(), true, false),
        (j.transfer_authority.to_account_info(), false, false),
        (j.perpetuals.to_account_info(), false, false),
        (j.jlp_pool.to_account_info(), true, false),
        (j.custody.to_account_info(), true, false),
        (j.custody_doves_price_account.to_account_info(), false, false),
        (j.custody_pythnet_price_account.to_account_info(), false, false),
        (j.custody_token_account.to_account_info(), true, false),
        (j.jlp_mint.to_account_info(), true, false),
        (j.token_program.to_account_info(), false, false),
        (j.event_authority.to_account_info(), false, false),
        (j.jupiter_program.to_account_info(), false, false),
    ];
    let mut metas = Vec::with_capacity(fixed.len() + rest.len());
    let mut infos = Vec::with_capacity(fixed.len() + rest.len() + 1);
    for (info, writable, signer) in fixed.iter() {
        metas.push(AccountMeta { pubkey: *info.key, is_writable: *writable, is_signer: *signer });
        infos.push(info.clone());
    }
    for info in rest.iter() {
        metas.push(AccountMeta { pubkey: *info.key, is_writable: info.is_writable, is_signer: false });
        infos.push(info.clone());
    }
    infos.push(j.jupiter_program.to_account_info());
    invoke_signed(
        &Instruction { program_id: JUPITER_PERPS_ID, accounts: metas, data },
        &infos,
        &[&vault.seeds()],
    )
    .map_err(Into::into)
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

/// Everything Jupiter Perps needs to add or remove liquidity, with the
/// vault's own token accounts named so the pass-through accounts cannot
/// redirect where the money goes. The accounts after these are Jupiter's own:
/// every custody, then every custody's Doves price account.
#[derive(Accounts)]
pub struct JupiterLiquidity<'info> {
    #[account(mut)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_lp: Box<Account<'info, TokenAccount>>,
    /// CHECK: Jupiter's pool; only `aum_usd` is read, and the owner is checked.
    #[account(mut)]
    pub jlp_pool: UncheckedAccount<'info>,
    #[account(mut)]
    pub jlp_mint: Box<Account<'info, Mint>>,
    /// CHECK: Jupiter's own PDA, passed through.
    pub transfer_authority: UncheckedAccount<'info>,
    /// CHECK: Jupiter's own PDA, passed through.
    pub perpetuals: UncheckedAccount<'info>,
    /// CHECK: the custody the USDC moves through; Jupiter checks it against the pool.
    #[account(mut)]
    pub custody: UncheckedAccount<'info>,
    /// CHECK: Jupiter checks this against the custody and refuses the wrong one.
    pub custody_doves_price_account: UncheckedAccount<'info>,
    /// CHECK: Jupiter checks this against the custody and refuses the wrong one.
    pub custody_pythnet_price_account: UncheckedAccount<'info>,
    /// CHECK: the custody's token account; Jupiter checks it against the custody.
    #[account(mut)]
    pub custody_token_account: UncheckedAccount<'info>,
    /// CHECK: Jupiter's own event authority, passed through.
    pub event_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK: pinned to the Jupiter Perps program id.
    #[account(address = JUPITER_PERPS_ID @ VaultError::NotJupiterPool)]
    pub jupiter_program: UncheckedAccount<'info>,
}

impl<'info> JupiterLiquidity<'info> {
    /// These are this vault's accounts, and this is the pool it was created
    /// against. Checked here rather than in an attribute, because the same
    /// accounts serve both directions.
    fn bound_to(&self, vault: &Account<'info, Vault>) -> Result<()> {
        require_keys_eq!(self.vault_usdc.key(), vault.vault_usdc, VaultError::NotJupiterPool);
        require_keys_eq!(self.vault_lp.key(), vault.vault_lp, VaultError::NotJupiterPool);
        require_keys_eq!(self.jlp_pool.key(), vault.pool, VaultError::NotJupiterPool);
        require_keys_eq!(self.jlp_mint.key(), vault.lp_mint, VaultError::NotJupiterPool);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitJlpVault<'info> {
    #[account(init, payer = payer, space = 8 + Vault::INIT_SPACE, seeds = [b"vault", venue.key().as_ref()], bump)]
    pub vault: Box<Account<'info, Vault>>,
    pub venue: Box<Account<'info, Venue>>,
    /// CHECK: owned by Jupiter Perps, and the custody below names it.
    #[account(owner = JUPITER_PERPS_ID @ VaultError::NotJupiterPool)]
    pub jlp_pool: UncheckedAccount<'info>,
    /// CHECK: the custody the vault exits into; its pool and mint are read here.
    #[account(owner = JUPITER_PERPS_ID @ VaultError::NotJupiterPool)]
    pub usdc_custody: UncheckedAccount<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(address = JLP_MINT @ VaultError::NotJupiterPool)]
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
pub struct ExitJlp<'info> {
    #[account(mut, has_one = venue)]
    pub vault: Box<Account<'info, Vault>>,
    pub venue: Box<Account<'info, Venue>>,
    pub jupiter: JupiterLiquidity<'info>,
}

#[derive(Accounts)]
pub struct ReenterJlp<'info> {
    #[account(mut, has_one = venue, has_one = share_mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub venue: Box<Account<'info, Venue>>,
    pub share_mint: Box<Account<'info, Mint>>,
    pub jupiter: JupiterLiquidity<'info>,
}

#[derive(Accounts)]
pub struct DepositJlp<'info> {
    #[account(has_one = venue, has_one = share_mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub venue: Box<Account<'info, Venue>>,
    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = vault.usdc_mint)]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint)]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    pub user: Signer<'info>,
    pub jupiter: JupiterLiquidity<'info>,
}

#[event]
pub struct VaultExited {
    pub vault: Pubkey,
    pub venue: Pubkey,
    pub lp_redeemed: u64,
    pub usdc_out: u64,
    /// LP tokens still held after this tranche; zero once fully out.
    pub lp_left: u64,
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
    #[msg("venue watches a program this vault cannot hold")]
    VenueMismatch,
    #[msg("minimum output is below the exit slippage floor")]
    SlippageFloor,
    #[msg("not the Jupiter Perps pool this vault holds")]
    NotJupiterPool,
}
