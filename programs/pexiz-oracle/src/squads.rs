//! Read-only decoding of Squads v4 multisig accounts and BPF upgradeable
//! loader program-data accounts. Layouts checked against
//! `squads-multisig-program` 2.0.0 (`state/multisig.rs`, `state/seeds.rs`).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

use crate::OracleError;

pub const SQUADS_V4_ID: Pubkey = pubkey!("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
/// `sha256("account:Multisig")[..8]`.
pub const MULTISIG_DISCRIMINATOR: [u8; 8] = [224, 116, 121, 186, 68, 161, 79, 236];
pub const SEED_PREFIX: &[u8] = b"multisig";
pub const SEED_VAULT: &[u8] = b"vault";

pub struct Multisig {
    pub config_authority: Pubkey,
    pub threshold: u16,
    pub time_lock: u32,
    pub members: Vec<Pubkey>,
}

/// Parses a Squads v4 `Multisig`. Members beyond `max_members` are an error,
/// since the oracle stores the member list.
pub fn parse_multisig(info: &AccountInfo, max_members: usize) -> Result<Multisig> {
    require_keys_eq!(*info.owner, SQUADS_V4_ID, OracleError::NotSquadsMultisig);
    let d = info.try_borrow_data()?;
    require!(d.len() >= 8 + 32 + 32 + 2 + 4 + 16 + 1 + 1 + 4, OracleError::NotSquadsMultisig);
    require!(d[..8] == MULTISIG_DISCRIMINATOR, OracleError::NotSquadsMultisig);
    let mut o = 8 + 32;
    let config_authority = Pubkey::new_from_array(d[o..o + 32].try_into().unwrap());
    o += 32;
    let threshold = u16::from_le_bytes(d[o..o + 2].try_into().unwrap());
    let time_lock = u32::from_le_bytes(d[o + 2..o + 6].try_into().unwrap());
    o += 6 + 16;
    // Borsh `Option<Pubkey>`: one tag byte, then 32 bytes only when Some.
    o += match d[o] {
        0 => 1,
        1 => 33,
        _ => return err!(OracleError::NotSquadsMultisig),
    };
    o += 1; // bump
    require!(d.len() >= o + 4, OracleError::NotSquadsMultisig);
    let n = u32::from_le_bytes(d[o..o + 4].try_into().unwrap()) as usize;
    o += 4;
    require!(n <= max_members, OracleError::TooManyMembers);
    require!(d.len() >= o + n * 33, OracleError::NotSquadsMultisig);
    let members = (0..n)
        .map(|i| Pubkey::new_from_array(d[o + i * 33..o + i * 33 + 32].try_into().unwrap()))
        .collect();
    Ok(Multisig { config_authority, threshold, time_lock, members })
}

pub fn vault_pda(multisig: &Pubkey, vault_index: u8) -> Pubkey {
    Pubkey::find_program_address(&[SEED_PREFIX, multisig.as_ref(), SEED_VAULT, &[vault_index]], &SQUADS_V4_ID).0
}

pub fn program_data_address(program: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[program.as_ref()], &bpf_loader_upgradeable::id()).0
}

/// Upgrade authority recorded in a program-data account. `None` when the
/// program is immutable or the account is no longer program data.
pub fn upgrade_authority(info: &AccountInfo) -> Option<Pubkey> {
    if *info.owner != bpf_loader_upgradeable::id() {
        return None;
    }
    let d = info.try_borrow_data().ok()?;
    // bincode `UpgradeableLoaderState::ProgramData { slot, upgrade_authority_address }`
    if d.len() < 45 || u32::from_le_bytes(d[..4].try_into().unwrap()) != 3 || d[12] != 1 {
        return None;
    }
    Some(Pubkey::new_from_array(d[13..45].try_into().unwrap()))
}

pub fn members_hash(members: &[Pubkey]) -> [u8; 32] {
    let mut sorted: Vec<&[u8]> = members.iter().map(|m| m.as_ref()).collect();
    sorted.sort_unstable();
    anchor_lang::solana_program::hash::hashv(&sorted).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discriminator_matches_anchor() {
        let h = anchor_lang::solana_program::hash::hash(b"account:Multisig").to_bytes();
        assert_eq!(h[..8], MULTISIG_DISCRIMINATOR);
    }

    #[test]
    fn members_hash_ignores_order() {
        let a = Pubkey::new_unique();
        let b = Pubkey::new_unique();
        assert_eq!(members_hash(&[a, b]), members_hash(&[b, a]));
        assert_ne!(members_hash(&[a, b]), members_hash(&[a]));
    }
}
