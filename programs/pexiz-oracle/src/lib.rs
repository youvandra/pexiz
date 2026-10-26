use anchor_lang::prelude::*;

declare_id!("C6323nptw1LPxcp6VYjL4ezUcuBJQUKpzADztKYrMzEC");

/// Seconds a venue must stay clear before a red or amber flag returns to green.
pub const COOL_OFF_SECS: i64 = 7 * 24 * 3600;
/// Seconds an unresolved amber may last before it escalates to red.
pub const AMBER_ESCALATION_SECS: i64 = 48 * 3600;

#[program]
pub mod pexiz_oracle {
    use super::*;

    /// Registers a venue: the program whose admin path is watched, the Squads
    /// multisig expected to hold its upgrade authority, and the vault-facing
    /// thresholds. The first snapshot is taken from the accounts passed in.
    pub fn register_venue(ctx: Context<RegisterVenue>, params: VenueParams) -> Result<()> {
        let _ = (ctx, params);
        todo!("validate program data + multisig, write first snapshot")
    }

    /// Permissionless update. Recomputes every signal from the accounts passed
    /// in and moves the flag. Optional remaining accounts are signer
    /// pre-signing accounts (System nonce accounts or offline-signer program
    /// nonces), each proven to be controlled by a current multisig member.
    pub fn update(ctx: Context<Update>) -> Result<()> {
        let _ = ctx;
        todo!("read multisig + program data, diff against snapshot, apply rules")
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VenueParams {
    /// Program whose upgrade authority is watched.
    pub program: Pubkey,
    /// Squads v4 multisig account expected to own the upgrade authority vault.
    pub multisig: Pubkey,
    /// Squads vault PDA that should be the program's upgrade authority.
    pub upgrade_authority: Pubkey,
    /// Minimum timelock (seconds) below which the flag goes red.
    pub min_time_lock_secs: u32,
    /// Seconds a user needs to withdraw at current exit capacity.
    pub exit_time_secs: u32,
}

#[account]
#[derive(InitSpace)]
pub struct Venue {
    pub params_program: Pubkey,
    pub multisig: Pubkey,
    pub upgrade_authority: Pubkey,
    pub min_time_lock_secs: u32,
    pub exit_time_secs: u32,
    pub snapshot: Snapshot,
    pub flag: Flag,
    pub reasons: u32,
    pub amber_since: i64,
    pub red_since: i64,
    pub clear_since: i64,
    pub last_update_slot: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default)]
pub struct Snapshot {
    pub threshold: u16,
    pub time_lock_secs: u32,
    pub member_count: u16,
    /// Hash of the sorted member keys, to detect replacement.
    pub members_hash: [u8; 32],
    /// Members replaced within the trailing 7 days.
    pub replaced_7d: u16,
    pub taken_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum Flag {
    #[default]
    Green,
    Amber,
    Red,
}

/// Bit flags recorded in `Venue::reasons`.
pub mod reason {
    pub const TIME_LOCK_BELOW_MIN: u32 = 1 << 0;
    pub const THRESHOLD_DROPPED: u32 = 1 << 1;
    pub const MEMBERS_REPLACED: u32 = 1 << 2;
    pub const UPGRADE_AUTHORITY_MOVED: u32 = 1 << 3;
    pub const SIGNER_PRESIGNING: u32 = 1 << 4;
    pub const AMBER_ESCALATED: u32 = 1 << 5;
}

#[derive(Accounts)]
#[instruction(params: VenueParams)]
pub struct RegisterVenue<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Venue::INIT_SPACE,
        seeds = [b"venue", params.program.as_ref()],
        bump
    )]
    pub venue: Account<'info, Venue>,
    /// CHECK: program-data account of `params.program`, parsed manually.
    pub program_data: UncheckedAccount<'info>,
    /// CHECK: Squads v4 multisig account, parsed manually.
    pub multisig: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut, seeds = [b"venue", venue.params_program.as_ref()], bump = venue.bump)]
    pub venue: Account<'info, Venue>,
    /// CHECK: must equal the program-data address derived from `venue.params_program`.
    pub program_data: UncheckedAccount<'info>,
    /// CHECK: must equal `venue.multisig`; parsed manually.
    pub multisig: UncheckedAccount<'info>,
}

#[event]
pub struct FlagChanged {
    pub venue: Pubkey,
    pub from: Flag,
    pub to: Flag,
    pub reasons: u32,
    pub slot: u64,
}

#[error_code]
pub enum OracleError {
    #[msg("program data account does not belong to the registered program")]
    WrongProgramData,
    #[msg("multisig account does not match the registered multisig")]
    WrongMultisig,
    #[msg("account is not a Squads v4 multisig")]
    NotSquadsMultisig,
    #[msg("pre-signing proof account is invalid or not controlled by a member")]
    BadPresigningProof,
}
