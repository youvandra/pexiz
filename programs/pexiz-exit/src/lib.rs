//! Auto-exit without a deposit. A holder keeps their LP tokens in their own
//! wallet and delegates them to this program's PDA with an SPL `approve`.
//! When the oracle venue they chose turns red, anyone can call `exit_*`: the
//! program redeems the delegated LP in the venue's own pool, at no worse than
//! the vault's slippage floor, and pays the USDC to the token account the
//! holder named when they set it up. The caller keeps `KEEPER_FEE_BPS` of it.
//!
//! It can do nothing else with a delegation: no exit while the venue is green
//! or amber, no other destination, no other pool. What makes running it
//! unattended safe is the oracle: red needs a proof account that exists on
//! chain, so nobody can push holders out with a false alarm.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use canary_venue::program::CanaryVenue;
use canary_venue::Pool;
use pexiz_oracle::{Flag, Venue, FAST_CANARY_PROGRAM};
use pexiz_vault::math::{canary_backing, exit_floor};
use pexiz_vault::{jlp_aum_usdc, JLP_MINT, JUPITER_PERPS_ID, REMOVE_LIQUIDITY2, USDC_MINT};

declare_id!("4GhBvwpJCaKgNuKZK4uXg3CKTZgXtJnY42BFX49qN2Nm");

/// What the caller who runs an exit keeps, out of the USDC delivered.
pub const KEEPER_FEE_BPS: u64 = 10;
/// The Jupiter Perps JLP pool.
pub const JLP_POOL: Pubkey = pubkey!("5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq");

const AUTHORITY: &[u8] = b"authority";

#[program]
pub mod pexiz_exit {
    use super::*;

    /// Opens the program's pass-through token account for `mint`. Redeemed
    /// USDC, and JLP on its way into the pool, stop here for the length of
    /// one exit. Anyone may open one, once per mint.
    pub fn open_route(_ctx: Context<OpenRoute>) -> Result<()> {
        Ok(())
    }

    /// Guards the holder's canary LP with `venue`, paying out to `usdc_dest`.
    /// The holder approves the program's authority as delegate in the same
    /// transaction; the amount approved is the most an exit can take.
    pub fn protect_canary(ctx: Context<ProtectCanary>) -> Result<()> {
        let watched = ctx.accounts.venue.params_program;
        require!(watched == canary_venue::ID || watched == FAST_CANARY_PROGRAM, ExitError::VenueMismatch);
        require!(ctx.accounts.venue.flag != Flag::Red, ExitError::VenueRed);
        let a = &mut *ctx.accounts;
        let g = &mut a.guard;
        g.holder = a.holder.key();
        g.venue = a.venue.key();
        g.pool = a.pool.key();
        g.lp_mint = a.pool.lp_mint;
        g.usdc_dest = a.usdc_dest.key();
        g.kind = Kind::Canary;
        g.bump = ctx.bumps.guard;
        Ok(())
    }

    /// Guards the holder's JLP with a venue that watches Jupiter Perps.
    pub fn protect_jlp(ctx: Context<ProtectJlp>) -> Result<()> {
        require_keys_eq!(ctx.accounts.venue.params_program, JUPITER_PERPS_ID, ExitError::VenueMismatch);
        require!(ctx.accounts.venue.flag != Flag::Red, ExitError::VenueRed);
        let a = &mut *ctx.accounts;
        let g = &mut a.guard;
        g.holder = a.holder.key();
        g.venue = a.venue.key();
        g.pool = JLP_POOL;
        g.lp_mint = JLP_MINT;
        g.usdc_dest = a.usdc_dest.key();
        g.kind = Kind::Jupiter;
        g.bump = ctx.bumps.guard;
        Ok(())
    }

    /// Stops guarding. The holder should also revoke the token delegation;
    /// without a guard the program cannot use it.
    pub fn unprotect(_ctx: Context<Unprotect>) -> Result<()> {
        Ok(())
    }

    /// Permissionless. If the guard's venue is red, burns up to `lp_amount`
    /// of the holder's delegated canary LP for USDC and pays it out. A
    /// position the pool cannot take in one go leaves in tranches, each
    /// held to the floor on its own.
    pub fn exit_canary(ctx: Context<ExitCanary>, lp_amount: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(a.guard.kind == Kind::Canary, ExitError::WrongPool);
        require!(a.venue.flag == Flag::Red, ExitError::VenueNotRed);
        let lp = exitable(&a.holder_lp, &a.authority.key(), lp_amount)?;
        let backing = canary_backing(a.usdc_reserve.amount, a.lp_mint.supply);
        let floor = exit_floor(lp, backing, a.lp_mint.supply).ok_or(ExitError::Overflow)?;
        let before = a.route_usdc.amount;
        canary_venue::cpi::remove_liquidity(
            CpiContext::new_with_signer(
                a.canary_program.to_account_info(),
                canary_venue::cpi::accounts::RemoveLiquidity {
                    pool: a.pool.to_account_info(),
                    lp_mint: a.lp_mint.to_account_info(),
                    usdc_reserve: a.usdc_reserve.to_account_info(),
                    user_usdc: a.route_usdc.to_account_info(),
                    user_lp: a.holder_lp.to_account_info(),
                    user: a.authority.to_account_info(),
                    token_program: a.token_program.to_account_info(),
                },
                &[&[AUTHORITY, &[ctx.bumps.authority]]],
            ),
            lp,
        )?;
        ctx.accounts.route_usdc.reload()?;
        let out = ctx.accounts.route_usdc.amount - before;
        require!(out >= floor, ExitError::Slippage);
        let a = &ctx.accounts;
        pay_out(&a.route_usdc, &a.usdc_dest, &a.keeper_usdc, &a.authority, &a.token_program, ctx.bumps.authority, out)?;
        record(&mut ctx.accounts.guard, &ctx.accounts.keeper_usdc.key(), lp, out)
    }

    /// Permissionless. If the guard's venue is red, moves the holder's
    /// delegated JLP into the route account and sells it to Jupiter Perps
    /// itself, with the floor read from the pool's own AUM in this
    /// transaction. Accounts after the named ones go to Jupiter unchanged:
    /// it values every custody before it prices JLP. `lp_amount` sizes the
    /// tranche, as in `exit_canary`.
    pub fn exit_jlp<'info>(ctx: Context<'_, '_, 'info, 'info, ExitJlp<'info>>, lp_amount: u64) -> Result<()> {
        let a = &ctx.accounts;
        require!(a.guard.kind == Kind::Jupiter, ExitError::WrongPool);
        require!(a.venue.flag == Flag::Red, ExitError::VenueNotRed);
        let lp = exitable(&a.holder_lp, &a.authority.key(), lp_amount)?;
        let floor = exit_floor(lp, jlp_aum_usdc(&a.jlp_pool)?, a.jlp_mint.supply).ok_or(ExitError::Overflow)?;
        let seeds: &[&[u8]] = &[AUTHORITY, &[ctx.bumps.authority]];

        // Jupiter wants its owner to own the LP account, so the JLP moves
        // into the route account first, under the delegation.
        token::transfer(
            CpiContext::new_with_signer(
                a.token_program.to_account_info(),
                Transfer { from: a.holder_lp.to_account_info(), to: a.route_lp.to_account_info(), authority: a.authority.to_account_info() },
                &[seeds],
            ),
            lp,
        )?;

        let before = a.route_usdc.amount;
        let mut data = Vec::with_capacity(24);
        data.extend_from_slice(&REMOVE_LIQUIDITY2);
        data.extend_from_slice(&lp.to_le_bytes());
        data.extend_from_slice(&floor.to_le_bytes());
        let fixed = [
            (a.authority.to_account_info(), false, true),
            (a.route_usdc.to_account_info(), true, false),
            (a.route_lp.to_account_info(), true, false),
            (a.transfer_authority.to_account_info(), false, false),
            (a.perpetuals.to_account_info(), false, false),
            (a.jlp_pool.to_account_info(), true, false),
            (a.custody.to_account_info(), true, false),
            (a.custody_doves_price_account.to_account_info(), false, false),
            (a.custody_pythnet_price_account.to_account_info(), false, false),
            (a.custody_token_account.to_account_info(), true, false),
            (a.jlp_mint.to_account_info(), true, false),
            (a.token_program.to_account_info(), false, false),
            (a.event_authority.to_account_info(), false, false),
            (a.jupiter_program.to_account_info(), false, false),
        ];
        let rest = ctx.remaining_accounts;
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
        infos.push(a.jupiter_program.to_account_info());
        invoke_signed(&Instruction { program_id: JUPITER_PERPS_ID, accounts: metas, data }, &infos, &[seeds])?;

        ctx.accounts.route_usdc.reload()?;
        let out = ctx.accounts.route_usdc.amount - before;
        require!(out >= floor, ExitError::Slippage);
        let a = &ctx.accounts;
        pay_out(&a.route_usdc, &a.usdc_dest, &a.keeper_usdc, &a.authority, &a.token_program, ctx.bumps.authority, out)?;
        record(&mut ctx.accounts.guard, &ctx.accounts.keeper_usdc.key(), lp, out)
    }
}

/// The LP an exit takes: the tranche asked for, up to what the holder
/// delegated to us and still holds.
fn exitable(holder_lp: &TokenAccount, authority: &Pubkey, tranche: u64) -> Result<u64> {
    require!(holder_lp.delegate == COption::Some(*authority), ExitError::NotDelegated);
    let lp = holder_lp.delegated_amount.min(holder_lp.amount).min(tranche);
    require!(lp > 0, ExitError::NothingToExit);
    Ok(lp)
}

/// Keeper's fee, rounded down.
pub fn keeper_fee(out: u64) -> u64 {
    (out as u128 * KEEPER_FEE_BPS as u128 / 10_000) as u64
}

fn pay_out<'info>(
    route: &Account<'info, TokenAccount>,
    dest: &Account<'info, TokenAccount>,
    keeper: &Account<'info, TokenAccount>,
    authority: &UncheckedAccount<'info>,
    token_program: &Program<'info, Token>,
    bump: u8,
    out: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[AUTHORITY, &[bump]];
    let fee = keeper_fee(out);
    for (to, amount) in [(dest, out - fee), (keeper, fee)] {
        if amount == 0 {
            continue;
        }
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                Transfer { from: route.to_account_info(), to: to.to_account_info(), authority: authority.to_account_info() },
                &[seeds],
            ),
            amount,
        )?;
    }
    Ok(())
}

fn record(g: &mut Account<Guard>, keeper: &Pubkey, lp: u64, out: u64) -> Result<()> {
    let clock = Clock::get()?;
    g.exits += 1;
    g.last_exit_slot = clock.slot;
    emit!(GuardExited {
        guard: g.key(),
        holder: g.holder,
        venue: g.venue,
        lp_in: lp,
        usdc_out: out,
        keeper_fee: keeper_fee(out),
        keeper_usdc: *keeper,
        slot: clock.slot,
    });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Kind {
    Canary,
    Jupiter,
}

/// One holder's standing order for one LP token: leave through `pool` when
/// `venue` is red, and pay `usdc_dest`.
#[account]
#[derive(InitSpace)]
pub struct Guard {
    pub holder: Pubkey,
    pub venue: Pubkey,
    pub pool: Pubkey,
    pub lp_mint: Pubkey,
    pub usdc_dest: Pubkey,
    pub kind: Kind,
    pub exits: u32,
    pub last_exit_slot: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct OpenRoute<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [b"route", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = authority
    )]
    pub route: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    /// CHECK: this program's signing PDA; holds no data.
    #[account(seeds = [AUTHORITY], bump)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProtectCanary<'info> {
    #[account(init, payer = holder, space = 8 + Guard::INIT_SPACE, seeds = [b"guard", holder.key().as_ref(), pool.lp_mint.as_ref()], bump)]
    pub guard: Account<'info, Guard>,
    pub venue: Account<'info, Venue>,
    pub pool: Account<'info, Pool>,
    #[account(token::mint = pool.usdc_mint, token::authority = holder)]
    pub usdc_dest: Account<'info, TokenAccount>,
    #[account(mut)]
    pub holder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProtectJlp<'info> {
    #[account(init, payer = holder, space = 8 + Guard::INIT_SPACE, seeds = [b"guard", holder.key().as_ref(), JLP_MINT.as_ref()], bump)]
    pub guard: Account<'info, Guard>,
    pub venue: Account<'info, Venue>,
    #[account(token::mint = USDC_MINT, token::authority = holder)]
    pub usdc_dest: Account<'info, TokenAccount>,
    #[account(mut)]
    pub holder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unprotect<'info> {
    #[account(mut, close = holder, has_one = holder)]
    pub guard: Account<'info, Guard>,
    #[account(mut)]
    pub holder: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExitCanary<'info> {
    #[account(mut, has_one = venue, has_one = pool, has_one = lp_mint, has_one = usdc_dest)]
    pub guard: Account<'info, Guard>,
    pub venue: Account<'info, Venue>,
    #[account(mut, token::mint = guard.lp_mint, token::authority = guard.holder)]
    pub holder_lp: Account<'info, TokenAccount>,
    /// CHECK: this program's signing PDA, the holder's delegate.
    #[account(seeds = [AUTHORITY], bump)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"route", pool.usdc_mint.as_ref()], bump)]
    pub route_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub usdc_dest: Account<'info, TokenAccount>,
    /// Whoever runs the exit names where their fee goes.
    #[account(mut, token::mint = pool.usdc_mint)]
    pub keeper_usdc: Account<'info, TokenAccount>,
    #[account(has_one = lp_mint, has_one = usdc_reserve)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,
    #[account(mut)]
    pub usdc_reserve: Account<'info, TokenAccount>,
    pub canary_program: Program<'info, CanaryVenue>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExitJlp<'info> {
    #[account(mut, has_one = venue, has_one = usdc_dest)]
    pub guard: Account<'info, Guard>,
    pub venue: Account<'info, Venue>,
    #[account(mut, token::mint = JLP_MINT, token::authority = guard.holder)]
    pub holder_lp: Box<Account<'info, TokenAccount>>,
    /// CHECK: this program's signing PDA, the holder's delegate.
    #[account(seeds = [AUTHORITY], bump)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"route", JLP_MINT.as_ref()], bump)]
    pub route_lp: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [b"route", USDC_MINT.as_ref()], bump)]
    pub route_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub usdc_dest: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = USDC_MINT)]
    pub keeper_usdc: Box<Account<'info, TokenAccount>>,
    /// CHECK: pinned to the JLP pool; only `aum_usd` is read.
    #[account(mut, address = JLP_POOL @ ExitError::WrongPool)]
    pub jlp_pool: UncheckedAccount<'info>,
    #[account(mut, address = JLP_MINT @ ExitError::WrongPool)]
    pub jlp_mint: Box<Account<'info, Mint>>,
    /// CHECK: Jupiter's own PDA, passed through.
    pub transfer_authority: UncheckedAccount<'info>,
    /// CHECK: Jupiter's own PDA, passed through.
    pub perpetuals: UncheckedAccount<'info>,
    /// CHECK: the custody the USDC moves through; Jupiter checks it against the pool.
    #[account(mut)]
    pub custody: UncheckedAccount<'info>,
    /// CHECK: Jupiter checks this against the custody.
    pub custody_doves_price_account: UncheckedAccount<'info>,
    /// CHECK: Jupiter checks this against the custody.
    pub custody_pythnet_price_account: UncheckedAccount<'info>,
    /// CHECK: the custody's token account; Jupiter checks it against the custody.
    #[account(mut)]
    pub custody_token_account: UncheckedAccount<'info>,
    /// CHECK: Jupiter's own event authority, passed through.
    pub event_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK: pinned to the Jupiter Perps program id.
    #[account(address = JUPITER_PERPS_ID @ ExitError::WrongPool)]
    pub jupiter_program: UncheckedAccount<'info>,
}

#[event]
pub struct GuardExited {
    pub guard: Pubkey,
    pub holder: Pubkey,
    pub venue: Pubkey,
    pub lp_in: u64,
    pub usdc_out: u64,
    pub keeper_fee: u64,
    pub keeper_usdc: Pubkey,
    pub slot: u64,
}

#[error_code]
pub enum ExitError {
    #[msg("venue does not watch the program behind this pool")]
    VenueMismatch,
    #[msg("venue is not red")]
    VenueNotRed,
    #[msg("the holder has not delegated this token account to the exit program")]
    NotDelegated,
    #[msg("nothing delegated is left to exit")]
    NothingToExit,
    #[msg("this guard is for a different pool")]
    WrongPool,
    #[msg("redemption returned less than the floor")]
    Slippage,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("venue is already red: leave directly instead of paying a keeper")]
    VenueRed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeper_fee_is_a_tenth_of_a_percent_rounded_down() {
        assert_eq!(keeper_fee(1_000_000), 1_000);
        assert_eq!(keeper_fee(999), 0);
    }
}
