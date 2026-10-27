//! Calls another program through a CPI, signing as the PDA `["owner"]`, and
//! passes its instruction data straight through. The vault would hold JLP the
//! same way, so if Jupiter Perps refuses this caller it refuses the vault.
//!
//! Account order: the program to call, then every account that call needs, in
//! its own order. The PDA is marked as a signer by the seeds below.

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, instruction::{AccountMeta, Instruction},
    program::invoke_signed, program_error::ProgramError, pubkey::Pubkey,
};

entrypoint!(process);

fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [target, rest @ ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let (owner, bump) = Pubkey::find_program_address(&[b"owner"], program_id);
    let metas: Vec<AccountMeta> = rest
        .iter()
        .map(|a| AccountMeta {
            pubkey: *a.key,
            is_signer: *a.key == owner || a.is_signer,
            is_writable: a.is_writable,
        })
        .collect();
    let ix = Instruction { program_id: *target.key, accounts: metas, data: data.to_vec() };
    invoke_signed(&ix, rest, &[&[b"owner", &[bump]]])
}
