# Architecture

Pexiz answers one question for LPs on Solana perps and prediction venues:
can you get out before the venue's admin can move your money? It also gets
you out when that answer changes.

```
             mainnet / devnet accounts
  ┌───────────────────────────────────────────────┐
  │ program-data (upgrade authority)              │
  │ Squads v4 multisig (threshold, timelock, keys)│
  │ System nonce accounts of members              │
  └──────────────┬────────────────────────────────┘
                 │ read                         
   services/crank ── simulate update ─▶ red? ──┐
                 │                             │
                 ▼                             ▼
     ┌─────────────────────┐   same tx   ┌───────────────────┐   CPI   ┌──────────────┐
     │ pexiz-oracle update │ ──────────▶ │ pexiz-vault exit  │ ──────▶ │ venue redeem │
     │ Venue PDA: flag     │             │ LP -> USDC        │         │ (canary / JLP)│
     └─────────┬───────────┘             └───────────────────┘         └──────────────┘
               │ FlagChanged event
               ▼
        services/alerts ──▶ Telegram
```

## On-chain programs

| Program | Id | Role |
|---|---|---|
| `pexiz-oracle` | `68dVVoeeYPmcPrNRycHwJAsLK25tMn6yiQhHQDWp2d7n` | One `Venue` account per watched program with a green/amber/red flag. Permissionless, proof-carrying updates. |
| `pexiz-vault` | `3WXGqGargd6Wig3czzD45kstziZGhQdQ5HYYdNJkJGnz` | USDC vault holding the venue's LP token; exits to USDC on red. |
| `canary-venue` | `CHpLfS2BA2knitoRmgeef2rULJy4dJ3PtBdL8R6ZTGjb` | Minimal USDC pool with an LP token, upgradeable by a Squads vault we create. Used for the live demo. |

### Accounts and PDAs

| Account | Seeds | Program |
|---|---|---|
| `Venue` | `["venue", watched_program]` | oracle |
| `Vault` | `["vault", venue]` | vault |
| share mint | `["shares", vault]` | vault |
| vault USDC / LP / share escrow | `["usdc" \| "lp" \| "escrow", vault]` | vault |
| `VoteRecord` | `["vote", vault, voter]` | vault |
| canary `Pool` | `["pool", usdc_mint]` | canary |
| canary LP mint / reserve | `["lp_mint" \| "reserve", pool]` | canary |
| Squads vault (read only) | `["multisig", multisig, "vault", index: u8]` | Squads v4 |
| program data (read only) | `[program]` | BPF upgradeable loader |

### Oracle

`register_venue` checks, from the accounts passed in, that the program data
belongs to the program, that its upgrade authority is the Squads vault PDA
of the given multisig, and that the multisig is a Squads v4 account. It
stores the first snapshot with a green flag. One venue per program; the
first registrant wins.

`update` re-reads the multisig and program data, verifies every remaining
account as a pre-signing proof, and runs the flag rules
([oracle-rules.md](oracle-rules.md)). It emits `FlagChanged` on every flag
change. The rules live in `rules.rs` as pure functions, so they are tested
and fuzzed on the host as well as on chain.

Pre-signing proofs go through a list of verifiers (`proofs.rs`). Today there
is one, for System durable-nonce accounts. Offline-signer programs (the Anza
Programmatic Signer, Blueshift Vector) become one more entry.

### Vault

- `deposit`: green flag, not exited, AUM cap of $10M. Takes USDC, buys the
  venue LP by CPI, mints shares at the current price (rounded down).
- `withdraw`: always open. Pays the pro-rata share of every token the vault
  holds: LP before an exit, USDC after it.
- `exit`: permissionless, red flag only. Redeems all LP to USDC by CPI with
  `min_usdc_out`, sets `exited` and emits `VaultExited`.
- `vote_reenter` / `unvote` / `reenter`: after an exit, holders escrow shares
  as votes. `reenter` needs a green flag (which implies the oracle's 7-day
  cool-off) and votes of at least half of all shares, then buys LP again.
  Escrowing the shares stops one balance voting twice.

The vault reads the oracle `Venue` as a typed Anchor account, so the owner
is checked. It binds to the venue at init and checks it with `has_one`.

## Services (TypeScript, Bun)

| Package | What it does |
|---|---|
| `packages/sdk` | Instruction builders from the Anchor IDLs, Squads v4 and nonce decoding, `findPresigningAccounts`, event parsing, RPC backoff, JLP instruction builders. |
| `packages/localnet` | In-process SVM (LiteSVM 0.3.3) harness used by the tests and the replay. |
| `services/crank` | Loops over venues, finds proofs, simulates `update`, sends it when anything changes, and puts `update` + `exit` in one transaction on red. One log line per venue per cycle. |
| `services/alerts` | Reads `FlagChanged` from a logs subscription or by polling, and posts plain-English messages to Telegram. `--dry-run` prints them. |
| `services/replay` | Replays the March–April 2026 attack with real parameters and dates on synthetic accounts and a warped clock. |
| `scripts/devnet` | Deploy and live-demo scripts using the real Squads SDK. |
| `scripts/measure` | Python mainnet measurement scripts. |

## Same-transaction exit

The crank simulates `update` alone and reads the simulated `Venue`. If the
flag would be red and the venue has a vault that has not exited, it sends
`[compute budget, oracle update, vault exit]` as one transaction. If the
chain moved between simulation and landing and the update no longer turns
red, `exit` fails and the whole transaction reverts. No partial state is
possible. The vault therefore leaves in the slot the signal appears, which
the tests check by comparing `exited_at_slot` with the `FlagChanged` slot.
