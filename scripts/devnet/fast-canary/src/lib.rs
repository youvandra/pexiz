//! The fast canary: a program with no instructions. What the oracle watches
//! is who can upgrade it, and that authority sits under a devnet Squads
//! multisig with a one-minute timelock. Cutting that timelock is the
//! "attack" a visitor can run from the app.

use solana_program::{account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey};

entrypoint!(process);

fn process(_program_id: &Pubkey, _accounts: &[AccountInfo], _data: &[u8]) -> ProgramResult {
    Ok(())
}
