# Open questions and blockers

Last updated 26 Oct 2026.

## Answered

**Squads v4 vault PDA seeds and multisig size.** Checked against the
`squads-multisig-program` 2.0.0 crate source (`state/seeds.rs`,
`state/multisig.rs`):

- Multisig PDA: `["multisig", "multisig", create_key]`.
- Vault PDA: `["multisig", multisig, "vault", vault_index: u8]`.
- Account size: `8 + 32 + 32 + 2 + 4 + 8 + 8 + 1 + 32 + 1 + 4 + 33 * members`.
  Space for `rent_collector` is always reserved, but the data is Borsh, so a
  `None` takes one byte and the member vector starts right after it.
- Account discriminator: `sha256("account:Multisig")[..8]` =
  `[224, 116, 121, 186, 68, 161, 79, 236]` (asserted in a unit test).

The oracle takes the vault index as a registration parameter and re-derives
the PDA on chain.

## Open

**No Solana RPC from the build environment.** The cloud session that built
M0–M6 cannot reach any Solana RPC host (`api.mainnet-beta.solana.com`,
`api.devnet.solana.com` and the public alternatives are denied by its network
policy). Consequences:

- Oracle tests use synthetic Squads multisigs with the measured mainnet
  parameters (Jupiter Perps 4 of 8, 86400 s; Drift 4 of 7, 3600 s) and
  generated member keys. `scripts/measure/fixtures.py` dumps the real
  accounts into `tests/fixtures/`, and the tests use them when present.
- M7 (devnet deploy) and M8 (mainnet fork) need a machine with RPC access.

**Squads program binary for local runs.** The Squads v4 program is not
built or cloned locally, so local tests write Squads-layout accounts
directly instead of calling Squads instructions. The devnet demo scripts
call the real Squads program through `@sqds/multisig`.
