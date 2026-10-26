# Pexiz: build plan

This file lives only on the `plan` branch. Never merge it into `main`, and never copy it into `main`. The branch is deleted before the repository goes public.

Read this whole file before writing code. Work happens on `main`, or on a branch cut from it.

## 0. Working rules

**Commits**
- Messages are short and human. A major change gets an imperative subject (`add oracle update rules`). A small one gets a plain sentence (`fix member hash ordering`).
- No contrast clauses, no long bodies.
- **No `Co-Authored-By` line, no "Generated with" footer.**
- One commit per real change. Split by subject.

**Repository content**
- Everything in the repo is in English.
- Never commit `CLAUDE.md`, `.claude/`, or this plan.
- No secrets in the repo. Keypairs go in `keys/` (gitignored); `.env.example` documents variables.

**Measurement**
- Every number in docs or UI is measured, with its date.
- When a figure cannot be measured, say so in the doc; never invent one.

**Verification**
- Prove behaviour by running it. A test passes or it does not.
- Report test counts and anything skipped.

**Scope**
- Your job is backend and chain: programs, SDK, crank, alerts, replay, tests.
- The web app (`app/`) is out of scope unless a later instruction adds it.

## 1. What Pexiz is

Pexiz answers one question for LPs and traders on Solana perps and prediction venues: **can you get out before the venue's admin can move your money?** It also gets you out automatically when that answer changes.

Three layers:
1. **Risk graph (off-chain read + on-chain account).** Per venue:
   - who holds the program upgrade authority;
   - the Squads multisig threshold, timelock and members;
   - whether any member controls a pre-signing account.
   These reduce to an **exit window**: admin delay minus the time a user needs to withdraw at current exit capacity.
2. **Proof-carrying oracle (`pexiz-oracle`).** One account per venue with a flag: green, amber or red. Updates are permissionless. The program recomputes every signal from the accounts passed in and never trusts a reporter. A red flag can only be set by passing the account that proves it.
3. **Escape vault (`pexiz-vault`).** LPs deposit USDC and the vault holds the venue LP token. On red, anyone calls `exit`, which redeems to USDC. The crank puts the oracle `update` and the vault `exit` in **one transaction**, so the vault leaves in the same slot the signal appears.

The demo venue is `canary-venue`, a tiny venue we control. In a live demo we weaken its admin setup on-chain and show the flag and the exit react with real signatures.

## 2. Facts measured on 26 Oct 2026 (mainnet)

Use these in tests, fixtures and docs, and re-measure before release.

**Program upgrade authorities** (`scripts/measure/squads.py`):

| Venue | Program | Authority |
|---|---|---|
| Jupiter Perps | `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu` | Squads v4 multisig `AxkJ8oH5aDu4ZRWfsujPtxdb6Vhq4gDehpoReBgrUUSm`, 4 of 8, `time_lock` 86400 |
| Drift | `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` | multisig `7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM`, 4 of 7, 3600 |
| Flash Trade | `FLASH6Lo6h3iasJKWDs2F8TkW2UKf3s15C8PMGuVfgBn` | multisig `Gb33UeQNnQ4XDuobtGq9M6PVKRVfoH77p8d6JXsgqyXF`, 3 of 7, **0** |
| Zeta | `ZETAxsqBRek56DhiGXrn75yj2NHU3aYUnxvHXpkf3aD` | Squads v3 (`SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu`), which has no timelock |
| Adrena | `13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet` | SPL Governance (`GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw`) |
| Phoenix | `PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY` | `8mv7G3fJq5a5ej7E14vgcSGeQKH79emjU9fVfuhyitEq`, dormant since 2024 |

Flash Trade's 0s timelock is a disclosure matter. Keep the venue name out of any public text until the owner decides.

**Squads v4 `Multisig` layout:**
- 8-byte discriminator
- `create_key` (32)
- `config_authority` (32)
- `threshold` u16
- `time_lock` u32 (seconds)
- `transaction_index` u64
- `stale_transaction_index` u64
- `rent_collector` `Option<Pubkey>`
- `bump` u8
- `members`: `Vec<{ key: Pubkey, permissions: u8 }>`

Squads v4 program: `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`. The upgrade authority is a vault PDA of the multisig. Verify the vault PDA seeds against the Squads v4 source before relying on them.

**System durable-nonce account** (80 bytes, owner System):
- `version` u32
- `state` u32 (1 = initialized)
- `authority` Pubkey at offset 8
- `durable_nonce` hash
- fee calculator

**Durable nonces are being deprecated** (solana.com/upgrades/durable-nonce-deprecation). The replacements are offline-signer programs: the Anza Programmatic Signer (72-byte nonce accounts) and Blueshift Vector. Support System nonces first. Design the proof checker so another pre-signing account type can be added as one more verifier.

**Exit capacity**, from Jupiter quotes for JLP→USDC:

| Size | Impact |
|---|---|
| $100K | 0.12% |
| $1M | 0.30% |
| $10M | 0.64% |
| $20M | 6.7% |
| $30M | returns $18.4M |

Hence `AUM_CAP_USDC` = $10M.

**Other venue facts**
- JLP mint: `27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4`
- Jupiter Perps pool authority: `AVzP2GeRmqGphJsMxWoqjpUifPpCret7LqWhD8NWQK49`
- Kamino JLP Market: $44.4M JLP collateral at 84% max LTV, $23.0M borrowed.

**April 2026 attack timeline** (Drift admin takeover):

| When (UTC) | Event |
|---|---|
| 23 Mar | Durable-nonce accounts appear, tied to two Security Council signers. |
| 27 Mar | Security Council migrated to timelock 0. |
| 30 Mar | A new nonce account is tied to an updated member. |
| 1 Apr 15:58–16:05 | Squads proposal create/approve/execute. |
| 1 Apr 16:05:19 | `UpdateAdmin` executes (tx `4BKBmAJn6TdsENij7CsVbyMVLJU1tX27nfrMM1zgKv1bs2KJy6Am2NqdA3nJm4g9C6eC64UAf5sNs974ygB9RsN1`, slot 410344009). It carries `SysvarRecentB1ockHashes`, so it was a nonce transaction. |
| 1 Apr, from 16:08 | Attacker wallet `HkGz4KmoZ7Zmk7HN6ndJ31UJ1qZ2qgwQxgVqQwovpZES` redeems ~41M stolen JLP through Jupiter's pool (`RemoveLiquidity2`). Jupiter SOL custody: 886,921 → 1,138 SOL in 4.5 min. USDC custody: $191.9M → $143.0M. |

JLP supply over the same period:
- 23–31 Mar: flat at -0.8%.
- 1→2 Apr: -45.1M, of which about 41M was the attacker.

**Slot time.** 200ms slots have been live since 9 Oct 2026; we measure 211ms. Alpenglow consensus has been live since 21 Oct.
- Never convert slots to seconds with a constant.
- Use the `Clock` sysvar `unix_timestamp` for every duration in the programs.

## 3. Program specs

### 3.1 `pexiz-oracle`

**`Venue` account**, PDA `["venue", program]`. Fields are in the scaffold.

**`register_venue(params)`**
- Checks that `program_data` is the program-data account of `params.program` (BPF upgradeable loader; derive it from the program account).
- Checks that its upgrade authority equals `params.upgrade_authority`.
- Checks that the multisig is owned by the Squads v4 program, parses it, and verifies that `params.upgrade_authority` is that multisig's vault PDA.
- Writes the first snapshot; the flag starts green.
- Registration is permissionless, with a deterministic PDA per program. If two registrants disagree on params, the first wins. A `reregister` that only refreshes from chain can come later.

**`update()`, with remaining accounts as pre-signing proofs**

Compute these conditions:
- `TIME_LOCK_BELOW_MIN`: `time_lock < min_time_lock_secs`.
- `THRESHOLD_DROPPED`: `threshold < snapshot.threshold`.
- `MEMBERS_REPLACED`: more than a third of members replaced within 7 days. Keep a small rolling record; a members hash plus a replaced counter with a window start is enough.
- `UPGRADE_AUTHORITY_MOVED`: the program-data authority differs from the registered vault PDA, or is None.
- `SIGNER_PRESIGNING`: any remaining account passes the proof check. For a System nonce: owner = System program, `data.len() == 80`, `state == 1`, and `authority` ∈ current members.

Flag rules:
- **Red** if any of `TIME_LOCK_BELOW_MIN | THRESHOLD_DROPPED | MEMBERS_REPLACED | UPGRADE_AUTHORITY_MOVED` holds, or amber has lasted `AMBER_ESCALATION_SECS` (48h).
- **Amber** if only `SIGNER_PRESIGNING` holds.
- **Green** only after every condition has been clear for `COOL_OFF_SECS` (7 days). Track `clear_since`.

Absence of a pre-signing account cannot be proven. Amber clears only by an update with no proofs, followed by the cool-off. A missed proof can delay amber. It can never produce a false red.

Every flag change emits `FlagChanged`. Store `reasons` and `last_update_slot`.

**Tests:** Anchor + bankrun or LiteSVM. Load real mainnet account snapshots as fixtures: Jupiter's multisig, Drift's multisig, and one real System nonce account.
- One test per reason bit.
- The escalation timeline with clock warps.
- Cool-off behaviour.
- A fake proof is rejected: wrong owner, uninitialized, non-member authority.
- A wrong program-data or multisig account is rejected.
- A fuzz/property test: a random sequence of config changes never produces red without a reason bit, and never returns to green before the cool-off.

### 3.2 `pexiz-vault`

`Vault` PDA `["vault", venue]`. Share mint PDA. USDC and LP token accounts are owned by the vault PDA.

**`deposit`**
- Requires a green flag, the vault not exited, and the AUM cap.
- Swaps USDC→LP. On a fork or devnet, start with the canary venue's `add_liquidity`.
- JLP integration path: Jupiter Perps `addLiquidity2` / `removeLiquidity2` by CPI. Read Jupiter's IDL; it needs pool, custody, oracle and doves accounts. If CPI proves impractical within scope, route through the Jupiter aggregator swap CPI instead, and document which.

**`withdraw`**: always allowed and pro-rata. After exit it pays USDC.

**`exit`**
- Permissionless.
- Requires the oracle venue flag to be red, read by deserializing the oracle `Venue` account with an owner check.
- Redeems all LP to USDC with `min_usdc_out`. Sets `exited`.

**`reenter`**
- Requires the flag to be green, which already implies the oracle cool-off.
- Requires share-weighted approval of at least 50% of shares.
- A simple vote record per depositor is fine.

**Tests**
- Full lifecycle against the canary venue on a local validator.
- `exit` before red fails.
- `exit` and `update` in the same transaction succeed.
- Withdraw works in every state.
- AUM cap.
- Rounding: never pay more than the vault holds.
- An invariant test over random sequences.

### 3.3 `canary-venue`

- A USDC pool, an LP mint, 1:1 redemption minus a small fee.
- Upgrade authority is a Squads v4 multisig vault that we create.
- A script to stand it up on devnet with a 3-of-5 multisig and a 24h timelock.
- Live-demo scripts, each using real Squads instructions:
  - (a) create a nonce account for one member → amber;
  - (b) propose and execute a config change setting `time_lock = 0` → red → the crank exits the vault.

## 4. Services (TypeScript, Bun)

**`packages/sdk`**
- Typed instruction builders from the Anchor IDLs.
- Squads v4 decoding, shared with `scripts/measure`.
- System nonce decoding.
- `findPresigningAccounts(members)`: getProgramAccounts on the System program with `dataSize 80` and a `memcmp` on the authority at offset 8, per member. Expect rate limits on public RPC; take the RPC URL from env and support a paid RPC.

**`services/crank`**
- Loop over registered venues.
- Fetch the multisig and program data, and find pre-signing accounts.
- Simulate `update`. If the result is red and a vault exists for the venue, send `update` + `exit` in one transaction.
- Back off on rate limits.
- Log one line per venue per cycle.

**`services/alerts`**
- Subscribe to `FlagChanged` logs, or poll.
- Post to Telegram with the reasons in plain English.
- `TELEGRAM_BOT_TOKEN` and the chat id come from env.

**`services/replay`**
- On a local validator, recreate the attack sequence with the drained venue's parameters: a 2-of-5 multisig, then the migration to timelock 0, plus nonce accounts on the right members.
- Step a warped clock through 23 Mar → 1 Apr.
- Show the flag at each step and the vault exit:
  - amber on 23 Mar;
  - red on 25 Mar by escalation;
  - red again on 27 Mar by the timelock.
- Print a timeline table.
- This replays real parameters and dates with synthetic accounts, and the output must say so.

## 5. Milestones (in order)

| | Work | Done when |
|---|---|---|
| **M0** | Toolchain: Rust, Solana/Agave CLI, Anchor 0.31.x (or the current stable, pinned in `Anchor.toml`); `anchor build` compiles all three programs. Real program ids in `Anchor.toml` and `declare_id!`. | `anchor build` passes. |
| **M1** | `pexiz-oracle` with the full rules and tests from §3.1. | All tests pass; test count reported. |
| **M2** | `canary-venue` and its tests. | Tests pass. |
| **M3** | `pexiz-vault` against the canary venue, with tests. | Tests pass. |
| **M4** | SDK, crank and the same-transaction update+exit. | Integration test on a local validator. |
| **M5** | Replay harness. | `bun run replay` prints the timeline. |
| **M6** | Alerts service. | A dry-run mode prints the messages. |
| **M7** | Devnet deploy of all three programs. Canary stood up with its Squads multisig. The live-demo scripts run end to end on devnet. | Tx signatures recorded in `docs/devnet.md`. |
| **M8** | JLP path: vault deposit/exit against Jupiter Perps on a mainnet fork (surfpool or `solana-test-validator --clone`). | Fork test passes, or a documented blocker. |
| **M9** | `docs/`: architecture, trust model, oracle rules, measured facts with dates, how to run. | Docs written. |

After each milestone: commit, then push.

Report:
- what runs;
- the test counts;
- what is still open.

## 6. Out of scope for now
- The web app.
- The gate program for venues.
- The cover market.
- Mainnet deploy.

These are roadmap only.

## 7. Open questions to flag back
- Exact Squads v4 vault PDA seeds and multisig account size, confirmed from source.
- Whether Jupiter Perps `removeLiquidity2` is callable by CPI from another program, and its account list.
- The Anza Programmatic Signer nonce account layout, once published, to add as a second proof type.
