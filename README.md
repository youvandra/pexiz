# Pexiz

Pexiz shows whether you can get out of a Solana perps or prediction venue before its admin can move your money, and gets you out automatically when that changes.

It has three parts:

- **Risk graph.** For each venue it reads from chain who holds upgrade and config authority, the threshold and timelock, and whether any signer holds a pre-signing (durable-nonce) account. It reduces these to one number: the exit window.
- **Proof-carrying oracle.** An on-chain account per venue holds a green, amber or red flag. Anyone can update it. The program recomputes every signal from the accounts passed in, so a red flag always carries its proof.
- **Escape vault.** LPs deposit USDC and the vault holds the venue's LP token. When the flag turns red, anyone can call exit and the vault redeems to USDC in the same transaction.

## Layout

```
programs/
  pexiz-oracle/   on-chain risk flag per venue
  pexiz-vault/    LP vault that exits on red
  canary-venue/   minimal venue we control, for live demos
services/
  crank/          permissionless oracle updater + vault exit caller
  alerts/         Telegram alerts on amber and red
  replay/         March–April 2026 attack replay harness
packages/
  sdk/            TypeScript client for the programs
  localnet/       in-process SVM harness for tests and the replay
scripts/
  measure/        mainnet measurement scripts (authorities, multisigs, nonces, drain)
  devnet/         devnet deploy and live-demo scripts
tests/            program tests (LiteSVM), a local-validator crank test, and a
                  mainnet-fork test against the real Jupiter Perps program
docs/             architecture, trust model, oracle rules, facts, running
app/              web app: landing, docs, replay, and the vault console
```

## Status (28 Oct 2026)

- All three programs build with `anchor build`.
- Tests pass: 37 host tests, 93 program and service tests in LiteSVM, 1 crank
  and alerts test on `solana-test-validator`, and 8 fork tests against the
  real Jupiter Perps program.
- `bun run replay` replays the April 2026 Drift admin takeover. The vault
  exits 7 days 16 hours before `UpdateAdmin`.
- The three programs are live on devnet, with a canary venue under a real
  Squads 3/5 multisig; both demos have run. See [docs/devnet.md](docs/devnet.md).
- Auto-exit without a deposit: a holder approves the `pexiz-exit` program
  once and keeps their LP in their own wallet; when the venue turns red,
  anyone can redeem it to USDC in that same wallet (0.1% to whoever runs it).
  Live on devnet: on 27 Oct the one-button attack in `/app/protect` cut the
  fast canary's timelock at 22:32:29 UTC and a guarded holder's 250 LP left
  for 249.50 USDC at 22:32:43. Proven on a mainnet fork against the real
  Jupiter Perps program too.
- A fast canary runs the same rules on minutes (5-minute cool-off instead of
  7 days), so the whole cycle can be watched live: cut the timelock, red,
  restore, green five minutes later. Live on devnet with its own vault. See [docs/devnet.md](docs/devnet.md#the-fast-canary).
- A vault can hold JLP: `init_jlp_vault` opens one against the real Jupiter
  pool, `deposit_jlp` buys JLP, `exit_jlp` sells it, `reenter_jlp` buys back in after a
  vote, and `withdraw` pays a holder out. `bun run test:fork` runs all of that against the real Jupiter
  Perps program on a mainnet fork.
- Left open: a venue that is neither the canary nor Jupiter has no deposit,
  exit or re-entry path yet. See [docs/open-questions.md](docs/open-questions.md).

## Docs

- [Architecture](docs/architecture.md)
- [Oracle rules](docs/oracle-rules.md)
- [Trust model](docs/trust-model.md)
- [Measured facts](docs/facts.md)
- [How to run](docs/running.md)
- [Devnet](docs/devnet.md)
- [Open questions](docs/open-questions.md)
