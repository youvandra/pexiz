# Devnet deploy and live demo

**Status (26 Oct 2026): not yet run.** The cloud session that built M0–M6 had
no route to any Solana RPC host, so the scripts below have been typechecked
but never run against devnet. The signature table at the end is empty until
someone runs them; the scripts append to it.

## Program ids

| Program | Id |
|---|---|
| `pexiz-oracle` | `C6323nptw1LPxcp6VYjL4ezUcuBJQUKpzADztKYrMzEC` |
| `pexiz-vault` | `JCYqZ5AdPyJHiRbnLdawunTassWwVZX5dCisasBq6q2p` |
| `canary-venue` | `gSmMMRDG25iC1CgG5eH4QvyPXSWb9fDU1jKMcMX3J38` |

Deploying to these ids needs the program keypairs in `keys/` (gitignored).
Without them, run `anchor keys sync`, rebuild, copy the new keypairs from
`target/deploy/` into `keys/`, and update this table.

## Run

From the repository root, with a funded devnet keypair (about 8 SOL covers
the three deploys) and the Solana CLI on `PATH`:

```sh
export PEXIZ_RPC_URL=https://api.devnet.solana.com   # or a paid devnet RPC
export PEXIZ_KEYPAIR=~/.config/solana/id.json
anchor build
cd scripts/devnet
bun run 1-deploy.ts              # deploys the three programs
bun run 2-setup-canary.ts        # Squads 3-of-5 / 24 h multisig, canary pool, venue, vault, deposit
bun run 3-demo-a-nonce.ts        # demo (a): member nonce account -> crank -> amber
bun run 4-demo-b-timelock.ts propose
# wait out the 24 h timelock
bun run 4-demo-b-timelock.ts execute   # demo (b): time_lock = 0 -> crank: update + exit in one tx
```

Every script is idempotent where it can be and keeps its state in
`keys/devnet-state.json`. Member keypairs live in `keys/member-*.json`.

What each demo shows:

- **(a) Pre-signing.** Member 0 creates a System durable-nonce account. The
  crank finds it with `getProgramAccounts` (data size 80, authority at offset
  8), passes it as a proof, and the oracle flag turns amber.
- **(b) Timelock cut.** Three members approve a Squads config transaction
  `SetTimeLock { new_time_lock: 0 }`. The multisig's own 24 h timelock
  applies to this change, so execution comes a day after approval; for a live
  demo, run `propose` the day before. Once executed, one crank cycle
  simulates the update, sees red, and sends `update` and `exit` in one
  transaction. The vault redeems its canary LP to USDC in that slot.

To watch alerts during the demo:
`bun run services/alerts/src/index.ts --poll --dry-run`.

## Signatures

| When (UTC) | Step | Signature |
|---|---|---|
