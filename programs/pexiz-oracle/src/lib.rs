use anchor_lang::prelude::*;

pub mod proofs;
pub mod rules;
pub mod squads;

declare_id!("C6323nptw1LPxcp6VYjL4ezUcuBJQUKpzADztKYrMzEC");

/// Seconds a venue must stay clear before a red or amber flag returns to green.
pub const COOL_OFF_SECS: i64 = 7 * 24 * 3600;
/// Seconds an unresolved amber may last before it escalates to red.
pub const AMBER_ESCALATION_SECS: i64 = 48 * 3600;
/// Trailing window for counting replaced multisig members.
pub const MEMBERS_WINDOW_SECS: i64 = 7 * 24 * 3600;
/// Largest multisig the oracle tracks. Measured venues have 7 or 8 members.
pub const MAX_MEMBERS: usize = 16;
/// Pre-signing accounts remembered per venue. Amber holds while any of them
/// is live, so a proof-less update cannot clear it.
pub const MAX_PRESIGNERS: usize = 8;

#[program]
pub mod pexiz_oracle {
    use super::*;

    /// Registers a venue: the program whose admin path is watched, the Squads
    /// multisig expected to hold its upgrade authority, and the vault-facing
    /// thresholds. The first snapshot is taken from the accounts passed in.
    pub fn register_venue(ctx: Context<RegisterVenue>, params: VenueParams) -> Result<()> {
        let program_data = squads::program_data_address(&params.program);
        require_keys_eq!(ctx.accounts.program_data.key(), program_data, OracleError::WrongProgramData);
        let authority = squads::upgrade_authority(&ctx.accounts.program_data)
            .ok_or(OracleError::WrongProgramData)?;
        require_keys_eq!(authority, params.upgrade_authority, OracleError::WrongUpgradeAuthority);
        require_keys_eq!(ctx.accounts.multisig.key(), params.multisig, OracleError::WrongMultisig);
        let ms = squads::parse_multisig(&ctx.accounts.multisig, MAX_MEMBERS)?;
        require_keys_eq!(
            squads::vault_pda(&params.multisig, params.vault_index),
            params.upgrade_authority,
            OracleError::WrongUpgradeAuthority
        );

        let clock = Clock::get()?;
        let v = &mut ctx.accounts.venue;
        v.params_program = params.program;
        v.program_data = program_data;
        v.multisig = params.multisig;
        v.upgrade_authority = params.upgrade_authority;
        v.vault_index = params.vault_index;
        v.min_time_lock_secs = params.min_time_lock_secs;
        v.exit_time_secs = params.exit_time_secs;
        v.snapshot = Snapshot {
            threshold: ms.threshold,
            time_lock_secs: ms.time_lock,
            member_count: ms.members.len() as u16,
            members_hash: squads::members_hash(&ms.members),
            replaced_7d: 0,
            taken_at: clock.unix_timestamp,
        };
        v.members = ms.members;
        v.presigners = Vec::new();
        v.flag = Flag::Green;
        v.baseline_threshold = ms.threshold;
        v.last_update_slot = clock.slot;
        v.bump = ctx.bumps.venue;
        Ok(())
    }

    /// Permissionless update. Recomputes every signal from the accounts passed
    /// in and moves the flag.
    ///
    /// Remaining accounts are pre-signing accounts (System nonce accounts or
    /// offline-signer program nonces). A new account must prove it is live and
    /// controlled by a current member; it is then remembered. A remembered
    /// account is dropped only when it is passed again and no longer proves
    /// itself (closed, uninitialized, or controlled by a non-member). Absence
    /// cannot be proven, so leaving proofs out changes nothing: amber holds and
    /// keeps escalating while any remembered account is live.
    pub fn update(ctx: Context<Update>) -> Result<()> {
        let ms = squads::parse_multisig(&ctx.accounts.multisig, MAX_MEMBERS)?;
        let authority = squads::upgrade_authority(&ctx.accounts.program_data);

        let clock = Clock::get()?;
        let v = &mut ctx.accounts.venue;
        let mut unrecorded_live = false;
        for acc in ctx.remaining_accounts {
            let live = proofs::proves_presigning(acc, &ms.members);
            let known = v.presigners.iter().position(|k| k == acc.key);
            match (live, known) {
                (true, Some(_)) => {}
                (true, None) if v.presigners.len() < MAX_PRESIGNERS => v.presigners.push(*acc.key),
                (true, None) => unrecorded_live = true,
                (false, Some(i)) => {
                    v.presigners.swap_remove(i);
                }
                (false, None) => return err!(OracleError::BadPresigningProof),
            }
        }
        let presigning = unrecorded_live || !v.presigners.is_empty();
        let newly_replaced = ms.members.iter().filter(|m| !v.members.contains(m)).count() as u16;
        let obs = rules::Observation {
            threshold: ms.threshold,
            time_lock_secs: ms.time_lock,
            member_count: ms.members.len() as u16,
            newly_replaced,
            authority_moved: authority != Some(v.upgrade_authority),
            presigning,
        };
        let mut st = v.rule_state();
        let from = rules::step(&mut st, &obs, clock.unix_timestamp);
        v.set_rule_state(&st);

        v.snapshot = Snapshot {
            threshold: ms.threshold,
            time_lock_secs: ms.time_lock,
            member_count: obs.member_count,
            members_hash: squads::members_hash(&ms.members),
            replaced_7d: st.replaced_7d,
            taken_at: clock.unix_timestamp,
        };
        v.members = ms.members;
        v.last_update_slot = clock.slot;

        if from != v.flag {
            emit!(FlagChanged {
                venue: v.key(),
                program: v.params_program,
                from,
                to: v.flag,
                reasons: v.reasons,
                slot: clock.slot,
                unix_timestamp: clock.unix_timestamp,
            });
        }
        msg!("flag {:?} reasons {:#x} active {:#x}", v.flag, v.reasons, v.active_reasons);
        Ok(())
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
    /// Squads vault index of `upgrade_authority`.
    pub vault_index: u8,
    /// Minimum timelock (seconds) below which the flag goes red.
    pub min_time_lock_secs: u32,
    /// Seconds a user needs to withdraw at current exit capacity.
    pub exit_time_secs: u32,
}

#[account]
#[derive(InitSpace)]
pub struct Venue {
    pub params_program: Pubkey,
    pub program_data: Pubkey,
    pub multisig: Pubkey,
    pub upgrade_authority: Pubkey,
    pub vault_index: u8,
    pub min_time_lock_secs: u32,
    pub exit_time_secs: u32,
    /// Config seen at the latest update.
    pub snapshot: Snapshot,
    /// Members seen at the latest update, to count replacements.
    #[max_len(MAX_MEMBERS)]
    pub members: Vec<Pubkey>,
    /// Pre-signing accounts proven live and not yet shown dead.
    #[max_len(MAX_PRESIGNERS)]
    pub presigners: Vec<Pubkey>,
    pub flag: Flag,
    /// Reasons latched since the flag last left green.
    pub reasons: u32,
    /// Reasons that held at the latest update.
    pub active_reasons: u32,
    pub amber_since: i64,
    pub red_since: i64,
    pub clear_since: i64,
    /// Threshold accepted while green.
    pub baseline_threshold: u16,
    pub replaced_window_start: i64,
    pub replaced_window_base: u16,
    pub low_threshold_since: i64,
    pub last_update_slot: u64,
    pub bump: u8,
}

impl Venue {
    /// Admin delay minus the time a user needs to get out, in seconds.
    /// Negative means users cannot exit before a change can land.
    pub fn exit_window_secs(&self) -> i64 {
        self.snapshot.time_lock_secs as i64 - self.exit_time_secs as i64
    }

    fn rule_state(&self) -> rules::RuleState {
        rules::RuleState {
            flag: self.flag,
            reasons: self.reasons,
            active_reasons: self.active_reasons,
            amber_since: self.amber_since,
            red_since: self.red_since,
            clear_since: self.clear_since,
            baseline_threshold: self.baseline_threshold,
            min_time_lock_secs: self.min_time_lock_secs,
            replaced_7d: self.snapshot.replaced_7d,
            replaced_window_start: self.replaced_window_start,
            replaced_window_base: self.replaced_window_base,
            low_threshold_since: self.low_threshold_since,
        }
    }

    fn set_rule_state(&mut self, s: &rules::RuleState) {
        self.flag = s.flag;
        self.reasons = s.reasons;
        self.active_reasons = s.active_reasons;
        self.amber_since = s.amber_since;
        self.red_since = s.red_since;
        self.clear_since = s.clear_since;
        self.baseline_threshold = s.baseline_threshold;
        self.replaced_window_start = s.replaced_window_start;
        self.replaced_window_base = s.replaced_window_base;
        self.low_threshold_since = s.low_threshold_since;
    }
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default, Debug)]
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
    /// CHECK: must equal the program-data address recorded at registration.
    #[account(address = venue.program_data @ OracleError::WrongProgramData)]
    pub program_data: UncheckedAccount<'info>,
    /// CHECK: must equal `venue.multisig`; parsed manually.
    #[account(address = venue.multisig @ OracleError::WrongMultisig)]
    pub multisig: UncheckedAccount<'info>,
}

#[event]
pub struct FlagChanged {
    pub venue: Pubkey,
    pub program: Pubkey,
    pub from: Flag,
    pub to: Flag,
    pub reasons: u32,
    pub slot: u64,
    pub unix_timestamp: i64,
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
    #[msg("upgrade authority does not match the program data or the multisig vault")]
    WrongUpgradeAuthority,
    #[msg("multisig has more members than the oracle tracks")]
    TooManyMembers,
}
