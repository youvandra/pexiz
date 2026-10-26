//! Pre-signing proofs. Each verifier recognises one kind of account that lets
//! a key sign a transaction now and land it later. Adding a new kind (the
//! Anza Programmatic Signer, Blueshift Vector) is one more entry in
//! `VERIFIERS`.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;

/// Outcome of one verifier on one account.
pub enum Verdict {
    /// Not this verifier's kind of account.
    Unknown,
    /// This verifier's kind, controlled by the returned key.
    Controlled(Pubkey),
    /// This verifier's kind, but not a live pre-signing account.
    Invalid,
}

pub type Verifier = fn(&AccountInfo) -> Verdict;

pub const VERIFIERS: &[Verifier] = &[system_nonce];

/// System durable-nonce account: owner System, 80 bytes, `state == 1`
/// (initialized), authority at offset 8.
pub fn system_nonce(info: &AccountInfo) -> Verdict {
    if *info.owner != system_program::ID {
        return Verdict::Unknown;
    }
    let Ok(d) = info.try_borrow_data() else {
        return Verdict::Invalid;
    };
    if d.len() != 80 {
        return Verdict::Invalid;
    }
    let state = u32::from_le_bytes(d[4..8].try_into().unwrap());
    if state != 1 {
        return Verdict::Invalid;
    }
    Verdict::Controlled(Pubkey::new_from_array(d[8..40].try_into().unwrap()))
}

/// True when `info` is a live pre-signing account controlled by a member.
pub fn proves_presigning(info: &AccountInfo, members: &[Pubkey]) -> bool {
    for v in VERIFIERS {
        match v(info) {
            Verdict::Unknown => continue,
            Verdict::Invalid => return false,
            Verdict::Controlled(key) => return members.contains(&key),
        }
    }
    false
}
