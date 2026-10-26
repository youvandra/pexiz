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
tests/            program tests (LiteSVM) and a local-validator crank test
docs/             architecture, trust model, oracle rules, facts, running
app/              web app (later)
```

## Status (26 Oct 2026)

- All three programs build with `anchor build`.
- Tests pass: 21 host tests, 64 program/service tests in LiteSVM and 1 crank
  and alerts integration test on `solana-test-validator`.
- `bun run replay` replays the April 2026 Drift admin takeover. The vault
  exits 7 days 16 hours before `UpdateAdmin`.
- Devnet deploy scripts are written but not yet run. The JLP path on a
  mainnet fork is blocked; see [docs/open-questions.md](docs/open-questions.md).

## Docs

- [Architecture](docs/architecture.md)
- [Oracle rules](docs/oracle-rules.md)
- [Trust model](docs/trust-model.md)
- [Measured facts](docs/facts.md)
- [How to run](docs/running.md)
- [Devnet](docs/devnet.md)
- [Open questions](docs/open-questions.md)
