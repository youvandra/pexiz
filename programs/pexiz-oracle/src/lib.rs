use anchor_lang::prelude::*;

pub mod proofs;
pub mod rules;
pub mod squads;
pub mod upgrades;

declare_id!("68dVVoeeYPmcPrNRycHwJAsLK25tMn6yiQhHQDWp2d7n");

/// Seconds a venue must stay clear before a red or amber flag returns to green.
pub const COOL_OFF_SECS: i64 = 7 * 24 * 3600;
/// Seconds of unresolved pre-signing before it is marked `AMBER_ESCALATED`.
/// The flag stays amber; only a config change turns it red.
pub const AMBER_ESCALATION_SECS: i64 = 48 * 3600;
/// Trailing window for counting replaced multisig members.
pub const MEMBERS_WINDOW_SECS: i64 = 7 * 24 * 3600;
/// Largest multisig the oracle tracks. Measured venues have 7 or 8 members.
pub const MAX_MEMBERS: usize = 16;
/// Pre-signing accounts remembered per venue. Amber holds while any of them
/// is live, so a proof-less update cannot clear it.
pub const MAX_PRESIGNERS: usize = 8;
/// Approved upgrade proposals remembered per venue. Amber holds while any of
/// them can still execute.
pub const MAX_PENDING_UPGRADES: usize = 4;
/// The one program the oracle times in minutes instead of days. It does
/// nothing; it exists so its upgrade authority can sit under a devnet
/// multisig with a one-minute timelock, and a visitor can watch a whole
/// attack, exit and recovery while they wait. Every other venue runs on
/// `rules::Timing::STANDARD`.
pub const FAST_CANARY_PROGRAM: Pubkey = pubkey!("432t9qKLgxBAZjy9LBuPSAuJBtPP52gM6ZW4o1r8fBqj");

/// The durations the rules use for a venue that watches `program`.
pub fn timing(program: &Pubkey) -> rules::Timing {
    if *program == FAST_CANARY_PROGRAM {
        rules::Timing::FAST
    } else {
        rules::Timing::STANDARD
    }
}

#[program]
pub mod pexiz_oracle {
    use super::*;

    /// Registers a venue: the program whose admin path is watched and the
    /// Squads multisig expected to hold its upgrade authority. Every baseline
    /// (threshold, timelock, members) is read from the accounts passed in, so
    /// whoever registers first chooses nothing that changes the flag.
    /// `exit_time_secs` is the one caller-supplied number, and only the
    /// exit-window display reads it.
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
        v.min_time_lock_secs = ms.time_lock;
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
        v.pending_upgrades = Vec::new();
        v.flag = Flag::Green;
        v.baseline_threshold = ms.threshold;
        v.last_update_slot = clock.slot;
        v.bump = ctx.bumps.venue;
        Ok(())
    }

    /// Permissionless update. Recomputes every signal from the accounts passed
    /// in and moves the flag.
    ///
    /// Remaining accounts are proofs of two kinds.
    ///
    /// Pre-signing accounts (System nonce accounts or offline-signer program
    /// nonces). A new account must prove it is live and controlled by a
    /// current member; it is then remembered. A remembered account is dropped
    /// only when it is passed again and no longer proves itself (closed,
    /// uninitialized, or controlled by a non-member). Absence cannot be
    /// proven, so leaving proofs out changes nothing: amber holds while any
    /// remembered account is live. Pre-signing never turns the flag red on
    /// its own: a nonce account can name any key as its authority without
    /// that key's signature, so it is a warning, not a proof.
    ///
    /// Pending upgrades: a Squads proposal and its vault transaction. An
    /// approved proposal whose transaction would upgrade, re-authorise or
    /// close the program is remembered; it is dropped when its proposal is
    /// passed executed, cancelled or rejected, or its account is closed.
    pub fn update(ctx: Context<Update>) -> Result<()> {
        let ms = squads::parse_multisig(&ctx.accounts.multisig, MAX_MEMBERS)?;
        let authority = squads::upgrade_authority(&ctx.accounts.program_data);

        let clock = Clock::get()?;
        let v = &mut ctx.accounts.venue;
        let remembered: Vec<(u64, Pubkey)> =
            v.pending_upgrades.iter().map(|&i| (i, upgrades::proposal_pda(&v.multisig, i))).collect();
        let (mut approved, mut targeted, mut done) = (Vec::new(), Vec::new(), Vec::new());
        let mut unrecorded_live = false;
        for acc in ctx.remaining_accounts {
            if upgrades::is_proposal(acc) {
                let p = upgrades::parse_proposal(acc).ok_or(OracleError::BadUpgradeProof)?;
                require_keys_eq!(p.multisig, v.multisig, OracleError::BadUpgradeProof);
                match p.status {
                    upgrades::Status::Pending => approved.push(p.index),
                    upgrades::Status::Done => done.push(p.index),
                    upgrades::Status::Open => {}
                }
                continue;
            }
            if upgrades::is_vault_transaction(acc) {
                if let Some(i) = upgrades::targets_program(acc, &v.multisig, v.vault_index, &v.program_data) {
                    targeted.push(i);
                }
                continue;
            }
            if let Some(&(i, _)) = remembered.iter().find(|(_, k)| k == acc.key) {
                // A remembered proposal's address that no longer holds one.
                done.push(i);
                continue;
            }
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
        v.pending_upgrades.retain(|i| !done.contains(i));
        let mut unrecorded_upgrade = false;
        for i in approved.into_iter().filter(|i| targeted.contains(i) && !done.contains(i)) {
            if v.pending_upgrades.contains(&i) {
                continue;
            }
            if v.pending_upgrades.len() < MAX_PENDING_UPGRADES {
                v.pending_upgrades.push(i);
            } else {
                unrecorded_upgrade = true;
            }
        }
        let upgrade_pending = unrecorded_upgrade || !v.pending_upgrades.is_empty();
        let newly_replaced = ms.members.iter().filter(|m| !v.members.contains(m)).count() as u16;
        let obs = rules::Observation {
            threshold: ms.threshold,
            time_lock_secs: ms.time_lock,
            member_count: ms.members.len() as u16,
            newly_replaced,
            authority_moved: authority != Some(v.upgrade_authority),
            presigning,
            upgrade_pending,
        };
        let mut st = v.rule_state();
        let from = rules::step_timed(&mut st, &obs, clock.unix_timestamp, &timing(&v.params_program));
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

    /// Permissionless. Takes a venue that has been red for a full cool-off
    /// and makes the admin path it sees now the new baseline: the multisig
    /// whose vault now holds the upgrade authority, its threshold, timelock
    /// and members. It is how a venue recovers from a legitimate migration
    /// or a lowered delay, which would otherwise read red forever.
    ///
    /// The flag stays red. The next updates start the cool-off as usual, so
    /// a venue returns to green at the earliest two cool-offs after the
    /// change that turned it red. Anyone who held through the first one was
    /// warned for all of it. An authority held by a single key, or by no one,
    /// cannot be rebaselined: it has no multisig vault to name.
    pub fn rebaseline(ctx: Context<Rebaseline>, vault_index: u8) -> Result<()> {
        let clock = Clock::get()?;
        let v = &mut ctx.accounts.venue;
        let cool_off = timing(&v.params_program).cool_off;
        require!(
            v.flag == Flag::Red && v.red_since != 0 && clock.unix_timestamp - v.red_since >= cool_off,
            OracleError::NotRedLongEnough
        );
        let authority = squads::upgrade_authority(&ctx.accounts.program_data).ok_or(OracleError::WrongUpgradeAuthority)?;
        let multisig = ctx.accounts.multisig.key();
        require_keys_eq!(squads::vault_pda(&multisig, vault_index), authority, OracleError::WrongUpgradeAuthority);
        let ms = squads::parse_multisig(&ctx.accounts.multisig, MAX_MEMBERS)?;

        let from = (v.multisig, v.snapshot.threshold, v.snapshot.time_lock_secs);
        v.multisig = multisig;
        v.upgrade_authority = authority;
        v.vault_index = vault_index;
        v.baseline_threshold = ms.threshold;
        v.min_time_lock_secs = ms.time_lock;
        v.low_threshold_since = 0;
        v.replaced_window_start = 0;
        v.replaced_window_base = 0;
        v.clear_since = 0;
        // Proposal indices belong to the multisig they were read from.
        v.pending_upgrades.clear();
        v.snapshot = Snapshot {
            threshold: ms.threshold,
            time_lock_secs: ms.time_lock,
            member_count: ms.members.len() as u16,
            members_hash: squads::members_hash(&ms.members),
            replaced_7d: 0,
            taken_at: clock.unix_timestamp,
        };
        v.members = ms.members;
        v.last_update_slot = clock.slot;
        emit!(VenueRebaselined {
            venue: v.key(),
            program: v.params_program,
            old_multisig: from.0,
            new_multisig: multisig,
            threshold: (from.1, v.snapshot.threshold),
            time_lock_secs: (from.2, v.snapshot.time_lock_secs),
            slot: clock.slot,
        });
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
    /// Seconds a user needs to withdraw at current exit capacity. Display
    /// only: no rule reads it.
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
    /// Timelock baseline: the multisig's timelock at registration, raised
    /// whenever the flag is green. A timelock below it is red.
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
    /// Squads transaction indices of approved upgrade proposals not yet shown
    /// executed or dropped. Last, so venues registered before it read empty.
    #[max_len(MAX_PENDING_UPGRADES)]
    pub pending_upgrades: Vec<u64>,
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
        self.min_time_lock_secs = s.min_time_lock_secs;
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
    pub const UPGRADE_PENDING: u32 = 1 << 6;
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

#[derive(Accounts)]
pub struct Rebaseline<'info> {
    #[account(mut, seeds = [b"venue", venue.params_program.as_ref()], bump = venue.bump)]
    pub venue: Account<'info, Venue>,
    /// CHECK: must equal the program-data address recorded at registration.
    #[account(address = venue.program_data @ OracleError::WrongProgramData)]
    pub program_data: UncheckedAccount<'info>,
    /// CHECK: the multisig whose vault now holds the upgrade authority; parsed manually.
    pub multisig: UncheckedAccount<'info>,
}

#[event]
pub struct VenueRebaselined {
    pub venue: Pubkey,
    pub program: Pubkey,
    pub old_multisig: Pubkey,
    pub new_multisig: Pubkey,
    /// (before, after)
    pub threshold: (u16, u16),
    /// (before, after)
    pub time_lock_secs: (u32, u32),
    pub slot: u64,
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
    #[msg("upgrade proof account is not a proposal of the registered multisig")]
    BadUpgradeProof,
    #[msg("a venue can be rebaselined only after a full cool-off in red")]
    NotRedLongEnough,
}
