use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

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
        let _ = ctx;
        todo!()
    }

    pub fn add_liquidity(ctx: Context<AddLiquidity>, usdc_amount: u64) -> Result<()> {
        let _ = (ctx, usdc_amount);
        todo!()
    }

    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, lp_amount: u64) -> Result<()> {
        let _ = (ctx, lp_amount);
        todo!()
    }
}

#[derive(Accounts)]
pub struct InitPool {}
#[derive(Accounts)]
pub struct AddLiquidity {}
#[derive(Accounts)]
pub struct RemoveLiquidity {}
