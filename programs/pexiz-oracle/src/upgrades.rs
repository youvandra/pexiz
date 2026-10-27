//! Pending-upgrade proofs: a Squads v4 proposal that is approved, so it can
//! execute once the timelock runs out, whose vault transaction would upgrade,
//! re-authorise or close the watched program. Layouts checked against the
//! `squads_multisig_program` IDL shipped with `@sqds/multisig` 2.1.4
//! (`Proposal`, `VaultTransaction`, `VaultTransactionMessage`).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

use crate::squads::{SEED_PREFIX, SQUADS_V4_ID};

/// `sha256("account:Proposal")[..8]`.
pub const PROPOSAL_DISCRIMINATOR: [u8; 8] = [26, 94, 189, 187, 116, 136, 53, 33];
/// `sha256("account:VaultTransaction")[..8]`.
pub const VAULT_TX_DISCRIMINATOR: [u8; 8] = [168, 250, 162, 100, 81, 14, 162, 207];
pub const SEED_TRANSACTION: &[u8] = b"transaction";
pub const SEED_PROPOSAL: &[u8] = b"proposal";

/// Loader instructions that change who controls the program or what it runs:
/// Upgrade, SetAuthority, Close, SetAuthorityChecked. Account 0 is the
/// program-data account in each.
const LOADER_TAGS: [u32; 4] = [3, 4, 5, 7];

/// Proposal status, reduced to what the oracle acts on.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    /// Approved or executing: it can land once the timelock allows.
    Pending,
    /// Executed, cancelled or rejected: it will not land (again).
    Done,
    /// Draft or still collecting votes.
    Open,
}

pub struct Proposal {
    pub multisig: Pubkey,
    pub index: u64,
    pub status: Status,
}

pub fn proposal_pda(multisig: &Pubkey, index: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[SEED_PREFIX, multisig.as_ref(), SEED_TRANSACTION, &index.to_le_bytes(), SEED_PROPOSAL],
        &SQUADS_V4_ID,
    )
    .0
}

fn squads_data<'a>(info: &'a AccountInfo, disc: &[u8; 8]) -> Option<std::cell::Ref<'a, [u8]>> {
    if *info.owner != SQUADS_V4_ID {
        return None;
    }
    let d = info.try_borrow_data().ok()?;
    (d.len() >= 8 && d[..8] == *disc).then(|| std::cell::Ref::map(d, |x| &x[..]))
}

pub fn is_proposal(info: &AccountInfo) -> bool {
    squads_data(info, &PROPOSAL_DISCRIMINATOR).is_some()
}

pub fn is_vault_transaction(info: &AccountInfo) -> bool {
    squads_data(info, &VAULT_TX_DISCRIMINATOR).is_some()
}

pub fn parse_proposal(info: &AccountInfo) -> Option<Proposal> {
    let d = squads_data(info, &PROPOSAL_DISCRIMINATOR)?;
    if d.len() < 8 + 32 + 8 + 1 {
        return None;
    }
    let multisig = Pubkey::new_from_array(d[8..40].try_into().ok()?);
    let index = u64::from_le_bytes(d[40..48].try_into().ok()?);
    // ProposalStatus: Draft, Active, Rejected, Approved, Executing, Executed, Cancelled.
    let status = match d[48] {
        3 | 4 => Status::Pending,
        2 | 5 | 6 => Status::Done,
        0 | 1 => Status::Open,
        _ => return None,
    };
    Some(Proposal { multisig, index, status })
}

/// Little cursor over borsh bytes; every read is bounds-checked.
struct Cur<'a> {
    d: &'a [u8],
    o: usize,
}

impl<'a> Cur<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.d.get(self.o..self.o.checked_add(n)?)?;
        self.o += n;
        Some(s)
    }
    fn u8(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }
    fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }
    fn bytes(&mut self) -> Option<&'a [u8]> {
        let n = self.u32()? as usize;
        self.take(n)
    }
}

/// When `info` is a vault transaction of `multisig`'s `vault_index` that
/// touches `program_data` through the upgradeable loader, its index.
///
/// An account loaded through an address lookup table cannot be resolved here.
/// Program IDs are always static keys, so a loader instruction whose first
/// account comes from a lookup table is counted: hiding the target that way
/// is itself the warning.
pub fn targets_program(info: &AccountInfo, multisig: &Pubkey, vault_index: u8, program_data: &Pubkey) -> Option<u64> {
    let d = squads_data(info, &VAULT_TX_DISCRIMINATOR)?;
    let mut c = Cur { d: &d, o: 8 };
    if Pubkey::new_from_array(c.take(32)?.try_into().ok()?) != *multisig {
        return None;
    }
    c.take(32)?; // creator
    let index = u64::from_le_bytes(c.take(8)?.try_into().ok()?);
    c.u8()?; // bump
    if c.u8()? != vault_index {
        return None;
    }
    c.u8()?; // vault bump
    c.bytes()?; // ephemeral signer bumps
    c.take(3)?; // signer counts
    let n_keys = c.u32()? as usize;
    let keys = c.take(n_keys.checked_mul(32)?)?;
    let key = |i: usize| keys.get(i * 32..i * 32 + 32).map(|k| Pubkey::new_from_array(k.try_into().unwrap()));
    let loader = bpf_loader_upgradeable::id();
    for _ in 0..c.u32()? {
        let program = key(c.u8()? as usize)?;
        let accounts = c.bytes()?;
        let data = c.bytes()?;
        if program != loader || data.len() < 4 {
            continue;
        }
        let tag = u32::from_le_bytes(data[..4].try_into().unwrap());
        if !LOADER_TAGS.contains(&tag) {
            continue;
        }
        match accounts.first().map(|&i| key(i as usize)) {
            Some(Some(k)) if k != *program_data => continue,
            // Our program data, or an account from a lookup table.
            _ => return Some(index),
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discriminators_match_anchor() {
        let p = anchor_lang::solana_program::hash::hash(b"account:Proposal").to_bytes();
        let t = anchor_lang::solana_program::hash::hash(b"account:VaultTransaction").to_bytes();
        assert_eq!(p[..8], PROPOSAL_DISCRIMINATOR);
        assert_eq!(t[..8], VAULT_TX_DISCRIMINATOR);
    }
}
