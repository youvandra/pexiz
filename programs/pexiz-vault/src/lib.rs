use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

/// Hard cap on assets under management in v1, set by measured exit capacity
/// (JLP sells at 0.64% impact for $10M and 6.7% for $20M, 26 Oct 2026).
pub const AUM_CAP_USDC: u64 = 10_000_000 * 1_000_000;

#[program]
pub mod pexiz_vault {
    use super::*;

    /// Creates a vault bound to one oracle venue and one LP token.
    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        let _ = ctx;
        todo!()
    }

    /// Deposit USDC; the vault buys the venue LP token. Refused unless the
    /// venue flag is green and the AUM cap holds.
    pub fn deposit(ctx: Context<Deposit>, usdc_amount: u64, min_lp_out: u64) -> Result<()> {
        let _ = (ctx, usdc_amount, min_lp_out);
        todo!()
    }

    /// Withdraw pro-rata. Always open, whatever the flag.
    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        let _ = (ctx, shares);
        todo!()
    }

    /// Permissionless. Reads the oracle venue account; if the flag is red,
    /// redeems all LP tokens to USDC and marks the vault exited. Designed to be
    /// called in the same transaction as the oracle update that turns it red.
    pub fn exit(ctx: Context<Exit>, min_usdc_out: u64) -> Result<()> {
        let _ = (ctx, min_usdc_out);
        todo!()
    }

    /// Re-enter after the venue has been green for the cool-off and depositors
    /// approved by share-weighted vote.
    pub fn reenter(ctx: Context<Reenter>, min_lp_out: u64) -> Result<()> {
        let _ = (ctx, min_lp_out);
        todo!()
    }
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub venue: Pubkey,
    pub lp_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub share_mint: Pubkey,
    pub exited: bool,
    pub exited_at_slot: u64,
    pub reentry_votes: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitVault {}
#[derive(Accounts)]
pub struct Deposit {}
#[derive(Accounts)]
pub struct Withdraw {}
#[derive(Accounts)]
pub struct Exit {}
#[derive(Accounts)]
pub struct Reenter {}

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
}
