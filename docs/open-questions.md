# Open questions and blockers

Last updated 28 Oct 2026.

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

**Resolved: RPC access and fixtures (26 Oct 2026).** The oracle tests now
load the real Jupiter Perps and Drift multisig accounts from
`tests/fixtures/` (dumped by `scripts/measure/fixtures.py`). Their Squads
vault PDA at index 0 matches each program's upgrade authority on mainnet.
M7 has run on devnet; see `docs/devnet.md`.

**Squads program binary for local runs.** The Squads v4 program is not
built or cloned locally, so local tests write Squads-layout accounts
directly instead of calling Squads instructions. The devnet demo scripts
call the real Squads program through `@sqds/multisig`.

**Resolved: M8, the JLP path on a mainnet fork (27 Oct 2026).** The real
Jupiter Perps program, the JLP pool, its six custodies and their price
accounts are cloned into a local validator by
`python3 scripts/measure/jlp.py --program`, and `bun run test:fork` takes
1,000 JLP out of the real pool twice: once from a wallet, once from a program
signing as a PDA. Both returned 44.24 SOL from the wSOL custody.

What the fork settled, each of it a guess before:

- **The remaining accounts.** The pool values its AUM first, so the call needs
  every custody, then every custody's Doves price account, in that order.
  Passing each custody's three price accounts instead overflows a legacy
  transaction at 1,319 bytes, so the Jupiter clients' address lookup tables
  are not optional decoration above that shape.
- **Which price account is the Doves oracle.** A custody holds three: a Pyth
  receiver account at offset 106 and two Doves accounts, at 320 and 384. The
  program named the one at **384**; offset 320 is something else. Passing 320
  fails with `InvalidOracleAccount` and prints both, which is how we know.
- **`perpetuals` is needed.** It is the PDA `["perpetuals"]` and holds the
  global config; without it the call fails `AccountNotInitialized`.
- **Jupiter Perps accepts a CPI caller.** A PDA-signed CPI from
  `tests/cpi-probe` returned exactly what the wallet got, so the vault can
  hold JLP and exit through this path. No stack-height check stands in the
  way, and the aggregator-swap fallback is not needed.
- **Prices go stale in 5 seconds.** A dump is older than that the moment it is
  written, so the test restamps the cloned Doves accounts, and only their
  timestamp. The prices are the ones that were on mainnet when `jlp.py` ran.

**Written since (27 Oct):** `exit_jlp` on the vault. It takes the same guards
as `exit` and calls Jupiter directly, signing as the vault PDA. Its floor is
the pool's own `aum_usd` divided by the JLP supply, read from the pool account
in the same transaction, so no caller can route the vault into a fire sale.
On the fork the vault took 100 JLP out for 445.55 USDC against a floor of
442.07.

**Closed (28 Oct):** a JLP vault can now be created and funded.
`init_jlp_vault` binds a vault to the Jupiter pool, checking the pool and the
custody it exits into against each other on chain (the custody names its pool
at offset 8 and its mint at offset 40), and pinning the LP mint to JLP.
`deposit_jlp` buys JLP from Jupiter, valuing the JLP the vault already holds
at the pool's own AUM per token rather than counting it as dollars. The fork
test now runs the whole life of a vault against the real program: open,
deposit $5,000 for 1,115.89 JLP, exit 1,000 JLP for 4,461.37 USDC against a
floor of 4,426.83, and withdraw a holder's half.

Left for a venue other than Jupiter: `deposit`, `reenter` and `exit` still
speak to the canary program, so re-entry after an exit is canary-only. A JLP
vault that has exited holds USDC its holders can withdraw, and cannot buy
back in.

**Anza Programmatic Signer.** The nonce account layout (72 bytes) is not
published in a form we could check. `proofs.rs` takes one more verifier
entry when it is.

**Measured numbers to re-check before release.** Everything in PLAN §2 was
measured on 26 Oct 2026 from mainnet and is quoted in `docs/facts.md`
with that date. Re-measure before release.
