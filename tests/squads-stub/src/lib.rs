//! Local test double for the Squads v4 program, loaded at the Squads v4
//! address on a local validator only. It owns Squads-layout multisig accounts
//! that tests preload, and lets a signer overwrite an account's data, which
//! stands in for a Squads config transaction (timelock, threshold, members).
//! It implements nothing else of Squads.

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, program_error::ProgramError, pubkey::Pubkey,
};

entrypoint!(process);

fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [target, signer, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if target.owner != program_id || !target.is_writable {
        return Err(ProgramError::IllegalOwner);
    }
    if !signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if target.data_len() != data.len() {
        target.resize(data.len())?;
    }
    target.try_borrow_mut_data()?.copy_from_slice(data);
    Ok(())
}
