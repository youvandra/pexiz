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

**M8: JLP path on a mainnet fork (blocked).** A fork needs mainnet RPC
(`solana-test-validator --url mainnet-beta --clone …` or surfpool), which this
environment does not have. What is known, and what the fork test must settle:

- Account list, from the Jupiter Perps IDL as published in
  `@exponent-labs/jupiter-perps-idl` 0.9.30 (third party, AGPL, not vendored;
  checked 26 Oct 2026). `removeLiquidity2` and `addLiquidity2` take, in
  order: `owner` (signer), `receivingAccount` / `fundingAccount`,
  `lpTokenAccount`, `transferAuthority`, `perpetuals`, `pool`, `custody`,
  `custodyDovesPriceAccount`, `custodyPythnetPriceAccount`,
  `custodyTokenAccount`, `lpTokenMint`, `tokenProgram`, `eventAuthority`,
  `program`. Params: `{ lp_amount_in: u64, min_amount_out: u64 }` and
  `{ token_amount_in: u64, min_lp_amount_out: u64, token_amount_pre_swap:
  Option<u64> }`. `packages/sdk/src/jlp.ts` builds both; only the encoding is
  tested.
- Unknown: the remaining accounts the pool needs to value AUM (expected:
  every custody with its price accounts), the pool and custody addresses
  (not hard-coded until read from chain), and whether Jupiter Perps refuses
  CPI callers. The vault's `owner` would be its PDA signing through
  `invoke_signed`, which works unless the program checks stack height.
- Fork test plan: clone `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu`, the
  JLP pool, its custodies, their token accounts and Doves/Pythnet price
  accounts, and the JLP mint; preload a token account holding JLP; call
  `removeLiquidity2` directly, then through a vault CPI. If CPI is refused,
  route the exit through the Jupiter aggregator swap CPI (JLP→USDC) and
  document it.

The vault's JLP instructions are not written yet: untested on-chain code
would be worse than none. The vault keeps the canary path until the fork
test can run.

**Anza Programmatic Signer.** The nonce account layout (72 bytes) is not
published in a form we could check. `proofs.rs` takes one more verifier
entry when it is.

**Measured numbers to re-check before release.** Everything in PLAN §2 was
measured on 26 Oct 2026 from mainnet and is quoted in `docs/facts.md`
with that date. None of it could be re-measured from this environment.
