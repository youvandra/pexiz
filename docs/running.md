# How to run

## Toolchain (as used on 26 Oct 2026)

| Tool | Version |
|---|---|
| Agave / Solana CLI | 3.0.10 (platform tools ship rustc 1.84) |
| Anchor CLI | 0.31.1 (`anchor-lang` resolves to 0.31.2) |
| Rust (host) | 1.97.0 |
| Bun | 1.4.4 |

The SBF toolchain's rustc 1.84 cannot parse crates that need edition 2024.
`.cargo/config.toml` makes Cargo pick dependency versions compatible with
the `rust-version = "1.84"` each program declares, and `Cargo.lock` pins
`blake3` to 1.8.2. Run `cargo update` with care.

## Build

```sh
anchor build          # three programs into target/deploy, IDLs into target/idl
bun run sync-idl      # copy the IDLs into packages/sdk/idl (committed)
bun install
```

## Tests

```sh
cargo test --workspace        # host: rules, share math, Squads decoding (24 tests)
bun test tests/*.test.ts      # programs in LiteSVM, replay, alerts, JLP encoding (68 tests)
bun run build:stub            # once: the Squads test double for the validator test
bun run test:validator        # crank + alerts on solana-test-validator (1 test)
bun run typecheck
```

Results on 26 Oct 2026, run locally with the real Jupiter Perps and Drift
multisig accounts as fixtures: 24/24 host tests, 68/68 LiteSVM tests and
1/1 validator test pass, with nothing skipped.

The validator test loads `tests/squads-stub` at the Squads v4 address. It is
a local test double that owns Squads-layout accounts and lets the test
rewrite them (standing in for a Squads config transaction). It is never
deployed anywhere else. Real Squads instructions are used by the devnet
scripts.

## Replay and alerts

```sh
bun run replay                 # March–April 2026 timeline
bun run alerts:dry-run         # the alerts that timeline would have sent
```

## Crank and alerts against a cluster

```sh
cp .env.example .env           # then fill in
PEXIZ_RPC_URL=... PEXIZ_KEYPAIR=... bun run services/crank/src/index.ts [--once]
PEXIZ_RPC_URL=... TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... bun run services/alerts/src/index.ts [--poll] [--dry-run]
```

`findPresigningAccounts` makes one `getProgramAccounts` call per multisig
member. Public RPCs rate-limit these. Use a paid RPC, or set
`CRANK_MEMBER_DELAY_MS`.

## Devnet

See [devnet.md](devnet.md).

## Mainnet fixtures

```sh
PEXIZ_RPC_URL=<mainnet rpc> python3 scripts/measure/fixtures.py [nonce_account]
```

This writes `tests/fixtures/{jupiter,drift}.json`. The oracle tests then use
the real multisig accounts in place of synthetic ones.

## Web app

```sh
bun run --cwd app dev      # http://127.0.0.1:5260
bun run --cwd app build
bun run --cwd app start    # serves app/dist on :5261 (PORT to change)
```

The app reads mainnet through `/rpc/mainnet` (set `PEXIZ_MAINNET_RPC_URL`)
and the canary vault straight from devnet. `/api/faucet` mints 1,000 test
USDC per wallet every 12 hours, plus 0.05 SOL when the wallet has none; it
signs with the test USDC mint authority at `PEXIZ_FAUCET_KEYPAIR` (default
`~/.config/solana/id.json`).
