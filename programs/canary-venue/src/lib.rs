use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("gSmMMRDG25iC1CgG5eH4QvyPXSWb9fDU1jKMcMX3J38");

/// Redemption fee in basis points.
pub const REDEEM_FEE_BPS: u64 = 10;

/// A minimal venue we control end to end, so a live demo can weaken a real
/// admin setup on-chain (cut the multisig timelock, add a pre-signing
/// account) and show the oracle and vault react with real signatures.
///
/// It issues an LP token against a USDC pool and redeems it 1:1 minus a fee.
/// Its upgrade authority is a Squads v4 multisig vault.
#[program]
pub mod canary_venue {
    use super::*;

    pub fn init_pool(ctx: Context<InitPool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.usdc_mint = ctx.accounts.usdc_mint.key();
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.usdc_reserve = ctx.accounts.usdc_reserve.key();
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    /// Deposits USDC and mints the same amount of LP.
    pub fn add_liquidity(ctx: Context<AddLiquidity>, usdc_amount: u64) -> Result<()> {
        require!(usdc_amount > 0, CanaryError::ZeroAmount);
        let a = &ctx.accounts;
        token::transfer(
            CpiContext::new(
                a.token_program.to_account_info(),
                Transfer {
                    from: a.user_usdc.to_account_info(),
                    to: a.usdc_reserve.to_account_info(),
                    authority: a.user.to_account_info(),
                },
            ),
            usdc_amount,
        )?;
        let seeds: &[&[u8]] = &[b"pool", a.pool.usdc_mint.as_ref(), &[a.pool.bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                a.token_program.to_account_info(),
                MintTo {
                    mint: a.lp_mint.to_account_info(),
                    to: a.user_lp.to_account_info(),
                    authority: a.pool.to_account_info(),
                },
                &[seeds],
            ),
            usdc_amount,
        )?;
        Ok(())
    }

    /// Burns LP and returns USDC 1:1 minus `REDEEM_FEE_BPS`. The fee stays in
    /// the pool.
    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, lp_amount: u64) -> Result<()> {
        require!(lp_amount > 0, CanaryError::ZeroAmount);
        let a = &ctx.accounts;
        token::burn(
            CpiContext::new(
                a.token_program.to_account_info(),
                Burn {
                    mint: a.lp_mint.to_account_info(),
                    from: a.user_lp.to_account_info(),
                    authority: a.user.to_account_info(),
                },
            ),
            lp_amount,
        )?;
        let out = redeem_amount(lp_amount);
        let seeds: &[&[u8]] = &[b"pool", a.pool.usdc_mint.as_ref(), &[a.pool.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                a.token_program.to_account_info(),
                Transfer {
                    from: a.usdc_reserve.to_account_info(),
                    to: a.user_usdc.to_account_info(),
                    authority: a.pool.to_account_info(),
                },
                &[seeds],
            ),
            out,
        )?;
        Ok(())
    }
}

pub fn redeem_amount(lp_amount: u64) -> u64 {
    (lp_amount as u128 * (10_000 - REDEEM_FEE_BPS) as u128 / 10_000) as u64
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub usdc_mint: Pubkey,
    pub lp_mint: Pubkey,
    pub usdc_reserve: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(init, payer = payer, space = 8 + Pool::INIT_SPACE, seeds = [b"pool", usdc_mint.key().as_ref()], bump)]
    pub pool: Account<'info, Pool>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        seeds = [b"lp_mint", pool.key().as_ref()],
        bump,
        mint::decimals = usdc_mint.decimals,
        mint::authority = pool
    )]
    pub lp_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        seeds = [b"reserve", pool.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool
    )]
    pub usdc_reserve: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(has_one = lp_mint, has_one = usdc_reserve)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,
    #[account(mut)]
    pub usdc_reserve: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.usdc_mint)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut, token::mint = lp_mint)]
    pub user_lp: Account<'info, TokenAccount>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(has_one = lp_mint, has_one = usdc_reserve)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,
    #[account(mut)]
    pub usdc_reserve: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.usdc_mint)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut, token::mint = lp_mint)]
    pub user_lp: Account<'info, TokenAccount>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum CanaryError {
    #[msg("amount must be positive")]
    ZeroAmount,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_rounds_down() {
        assert_eq!(redeem_amount(1_000_000), 999_000);
        assert_eq!(redeem_amount(1), 0);
        assert_eq!(redeem_amount(u64::MAX), (u64::MAX as u128 * 9990 / 10_000) as u64);
    }
}
