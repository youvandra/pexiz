# Measured facts

All figures below were measured from mainnet on **26 Oct 2026** with the
scripts in `scripts/measure/`, unless a row says otherwise. Re-measure before
release. None could be re-measured from the environment that wrote this file
(no RPC access).

## Program upgrade authorities

| Venue | Program | Authority (26 Oct 2026) |
|---|---|---|
| Jupiter Perps | `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu` | Squads v4 multisig `AxkJ8oH5aDu4ZRWfsujPtxdb6Vhq4gDehpoReBgrUUSm`, 4 of 8, `time_lock` 86400 s |
| Drift | `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` | multisig `7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM`, 4 of 7, 3600 s |
| Zeta | `ZETAxsqBRek56DhiGXrn75yj2NHU3aYUnxvHXpkf3aD` | Squads v3 (`SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu`), no timelock |
| Adrena | `13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet` | SPL Governance (`GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw`) |
| Phoenix | `PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY` | `8mv7G3fJq5a5ej7E14vgcSGeQKH79emjU9fVfuhyitEq`, dormant since 2024 |

One more perps venue was measured and is withheld here pending disclosure.

## Exit capacity (JLP → USDC, Jupiter quotes, 26 Oct 2026)

| Size | Price impact |
|---|---|
| $100K | 0.12% |
| $1M | 0.30% |
| $10M | 0.64% |
| $20M | 6.7% |
| $30M | returns $18.4M |

Hence `AUM_CAP_USDC` = $10M in `pexiz-vault`.

## Other venue facts (26 Oct 2026)

- JLP mint: `27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4`.
- Jupiter Perps pool authority: `AVzP2GeRmqGphJsMxWoqjpUifPpCret7LqWhD8NWQK49`.
- Kamino JLP market: $44.4M JLP collateral at 84% max LTV, $23.0M borrowed.

## Slot time

200 ms slots have been live since 9 Oct 2026; we measured 211 ms. Alpenglow
consensus has been live since 21 Oct 2026. The programs never convert slots
to seconds.

## April 2026 attack timeline (Drift admin takeover)

| When (UTC) | Event |
|---|---|
| 23 Mar | Durable-nonce accounts appear, tied to two Security Council signers. |
| 27 Mar | Security Council migrated to timelock 0. |
| 30 Mar | A new nonce account is tied to an updated member. |
| 1 Apr 15:58–16:05 | Squads proposal create/approve/execute. |
| 1 Apr 16:05:19 | `UpdateAdmin` executes (tx `4BKBmAJn6TdsENij7CsVbyMVLJU1tX27nfrMM1zgKv1bs2KJy6Am2NqdA3nJm4g9C6eC64UAf5sNs974ygB9RsN1`, slot 410344009). It carries `SysvarRecentB1ockHashes`, so it was a nonce transaction. |
| 1 Apr, from 16:08 | Attacker wallet `HkGz4KmoZ7Zmk7HN6ndJ31UJ1qZ2qgwQxgVqQwovpZES` redeems ~41M stolen JLP through Jupiter's pool (`RemoveLiquidity2`). Jupiter SOL custody: 886,921 → 1,138 SOL in 4.5 min. USDC custody: $191.9M → $143.0M. |

JLP supply was flat (-0.8%) from 23 to 31 Mar and fell by 45.1M from 1 to
2 Apr, of which about 41M was the attacker. Total drained: about $285M.

The Security Council was 2 of 5 at the time. Its timelock before the 27 Mar
migration was not measured. The replay uses Drift's 26 Oct 2026 value
(3600 s) and says so in its output.

## Replay result (run 26 Oct 2026, synthetic accounts)

`bun run replay`: amber at 23 Mar 00:00, escalated amber at 25 Mar 00:00,
red at 27 Mar 00:00 when the timelock is cut, with the vault exit in the
same transaction, 5 d 16 h before `UpdateAdmin`. Until 31 Oct 2026 an
escalated amber turned red and exited on 25 Mar; that rule was dropped
because anyone can create a nonce account naming a member. The exit time
is the same with the pre-signing proofs left out, 5 d 16 h
before. Event times inside a day are not measured; the replay uses 00:00 UTC.
