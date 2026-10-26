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
scripts/
  measure/        mainnet measurement scripts (authorities, multisigs, nonces, drain)
app/              web app (later)
```

## Status

Early development.
