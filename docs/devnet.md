# Devnet deploy and live demo

**Status (28 Oct 2026):** all three programs are deployed to devnet. The canary
venue runs under a real Squads v4 multisig (3 of 5, originally a 24 h
timelock) with the venue registered in the oracle and an escape vault holding
1,000 test USDC. Both demos have run. Demo (a): a member's nonce account turned
the flag green → amber. Demo (b): the multisig cut its own timelock to 0 on
27 Oct 2026 at 16:39 UTC, and the next crank cycle turned the flag red and
exited the vault in the same transaction. The signature table below is
appended by the scripts.

Devnet accounts:

| What | Address |
|---|---|
| Squads multisig | `CeUSyhSs2WoUMZFjm6oWkUkukyFQ9QX8njbYFBF4er1w` |
| Squads vault (canary upgrade authority) | `8V7rC1LooEr1yebka2ENAiBtb4AqTm39Bh6HffwZGnVY` |
| Oracle venue (canary) | `UL2XgkscGLzfwp9oZNZbtFUMmqKFLb5Mr3qc1LuZQjF` |
| Escape vault | `2UAGAGpCTsoVA3nsKTnWzUhWjRvd8L1dYie367dBeYPL` |
| Test USDC mint | `6GCS4RCvHEZbLArUF4UwNguWww1vy4Z2uTPTxSMSDrqX` |
| Member nonce account (demo a) | `HxyqLL79JWJTA6KbvNkRyxtjMUCCfiKj5JAKyEV4jF3m` |

## The fast canary

A second venue the oracle times in minutes (see
[oracle rules](oracle-rules.md#the-fast-canary)), so the whole cycle can be
watched live: cut the timelock, the vault exits, restore it, the flag turns
green five minutes later, holders vote and the vault buys back in.

| What | Address |
|---|---|
| Fast canary program (no instructions) | `432t9qKLgxBAZjy9LBuPSAuJBtPP52gM6ZW4o1r8fBqj` |
| Squads multisig, 3 of 5, 60 s timelock | `EcjhTcso3AC73nCFj1mHzZCrHKBS4WfjoBki1cPmkVh7` |
| Oracle venue | `2nsPaWreh4ca67e42NHrH2XSKkvgjBcacaDehvRRzxK5` |

Its escape vault holds the same canary pool LP as the slow one. Same members
as the slow canary; the demo (a) nonce account was closed on 27 Oct so the
fast venue starts with no pre-signing.

```sh
cd scripts/devnet/fast-canary && cargo build-sbf && cd ..
bun run 5-fast-canary.ts setup     # program, multisig, venue, vault, 100,000 USDC
bun run 5-fast-canary.ts attack    # SetTimeLock 0 after the 60 s timelock, crank: red + exit
bun run 5-fast-canary.ts restore   # SetTimeLock 60, at once; green 5 minutes later
bun run 5-fast-canary.ts reenter   # vote every share, reenter, take the votes back
```

## Program ids

| Program | Id |
|---|---|
| `pexiz-oracle` | `68dVVoeeYPmcPrNRycHwJAsLK25tMn6yiQhHQDWp2d7n` |
| `pexiz-vault` | `3WXGqGargd6Wig3czzD45kstziZGhQdQ5HYYdNJkJGnz` |
| `canary-venue` | `CHpLfS2BA2knitoRmgeef2rULJy4dJ3PtBdL8R6ZTGjb` |

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
| 2026-10-26 16:25:13 | deploy pexiz_oracle | [`4rQuSsSLcQnsQgLS…`](https://explorer.solana.com/tx/4rQuSsSLcQnsQgLSckW8VKKE7eH2VaBQH3sKeXLNdZnG1iicFS2arHpAaAmZzgTq6kquQntEXzj8g1c7u9GsurVr?cluster=devnet) |
| 2026-10-26 16:25:34 | deploy pexiz_vault | [`2eGgvituc9zKfC7h…`](https://explorer.solana.com/tx/2eGgvituc9zKfC7havvQGFYS7QSovQ2oSd9ebUq1Bk1dCoxz4r3xz1APztcNmQYowfhZCx6gSBSpZ6Es84FssPgb?cluster=devnet) |
| 2026-10-26 16:25:53 | deploy canary_venue | [`2XqkP6VnTysKb228…`](https://explorer.solana.com/tx/2XqkP6VnTysKb228t1xfCZea3Mbru9sDzCQUqRtzxRtzUTsxLvvFuN73HQLzqHE4QFHm2kG2FH3yBuLMKox5No68?cluster=devnet) |
| 2026-10-26 16:26:01 | fund BtbTbzkQ | [`xU3xk97ozoRE4GrK…`](https://explorer.solana.com/tx/xU3xk97ozoRE4GrKeHmNW6cKp9LtVa2WmAeDHt38wNy1UpRWA9DzjpFowSPc115N8fxPeYtoySpRcnGsc7cqBim?cluster=devnet) |
| 2026-10-26 16:26:02 | fund 3hGQ1BN8 | [`2Fe1f6mmDaMq24bE…`](https://explorer.solana.com/tx/2Fe1f6mmDaMq24bEZqvNceL5juRbQF6XhS5UHfQ44WsSvBDNcVq9XMrRsC26ShyWXxaQwBNWHAjPqA5N8h7FKuyT?cluster=devnet) |
| 2026-10-26 16:26:03 | fund 6AQq43h8 | [`2WmuT9tSPi1cVbgu…`](https://explorer.solana.com/tx/2WmuT9tSPi1cVbguxemQryAjYucetKnPaGgozAZvY63DXnFNhr9nsoTeABcEufmqHmA5isyNuowEaTDvgrtjSKLF?cluster=devnet) |
| 2026-10-26 16:26:04 | fund 4N4qxRDs | [`4pKAaFeS3CDMoMKd…`](https://explorer.solana.com/tx/4pKAaFeS3CDMoMKdXCRz1gM67rY15bt3SMHRynmFVDK8Jw2EUSs8Grimp6f2SGNVK3YeiRDpApPUSXpfBc443k9H?cluster=devnet) |
| 2026-10-26 16:26:05 | fund 5XbJyaUH | [`3RyS5qfLdMfVQApZ…`](https://explorer.solana.com/tx/3RyS5qfLdMfVQApZ1JTiYA9yz4JzXMLwxKcTUwzaTCZNTB4H3oYTXpSjb7h8UsC2NDeqr8yNRJE8eFJvTEnpYJoM?cluster=devnet) |
| 2026-10-26 16:26:06 | squads multisigCreateV2 3-of-5, 24 h timelock | [`3xRpQSahVhqgrj6r…`](https://explorer.solana.com/tx/3xRpQSahVhqgrj6rjtYfadUv1D7FJCcpyMzPengN2aDLiC7Du4ACjQ4aU7pKDKy5omUgoGp5pVZ64okxm6ivQSD1?cluster=devnet) |
| 2026-10-26 16:26:07 | canary upgrade authority -> squads vault | [`4S2XrGwwAcGasBmb…`](https://explorer.solana.com/tx/4S2XrGwwAcGasBmboowu5FZWtvtoJXjr1UyKZdaGi7evdxjmidVjZegGo8siS2kXrRwNdqNbqmGuQGfVcWytz1hf?cluster=devnet) |
| 2026-10-26 16:26:09 | canary init_pool | [`5VgyM7Tiducbnzw6…`](https://explorer.solana.com/tx/5VgyM7Tiducbnzw6qK57NJDJKzkrpPF7KcGUhzApNuMeadrewXVMgbhGJVesG7qoWksQyqGcMdopU9K6v3kYa38t?cluster=devnet) |
| 2026-10-26 16:26:09 | oracle register_venue (canary) | [`wpzdcXqvcoCijKP1…`](https://explorer.solana.com/tx/wpzdcXqvcoCijKP1z6PAT3nFFobyNjRnHLtgdU3Z6yhtSR9EQurpGpeMDjGep1C8AB3r7tccFeCryeHYHWCLZnN?cluster=devnet) |
| 2026-10-26 16:26:10 | vault init_vault | [`gXWhsuoqMA7SdmzR…`](https://explorer.solana.com/tx/gXWhsuoqMA7SdmzRK9xxMHTai4hcYtagES3TUf6RUeGSFGZNusxWLYGdPUEJoMFakuk9gM7SjqNggSyqDf8UuBG?cluster=devnet) |
| 2026-10-26 16:26:13 | vault deposit 1,000 test USDC | [`5UvETsb6Kwfqywcb…`](https://explorer.solana.com/tx/5UvETsb6KwfqywcbmDCwDEP6UEgp3DYgArP8TA5Kr4VvdXty13949WWc3ue6oHTeoR59PzV4UrKED8TBb8wgMKVW?cluster=devnet) |
| 2026-10-26 16:26:59 | demo (a): nonce account for member BtbTbzkQ | [`67a5jCx2sC7g24n3…`](https://explorer.solana.com/tx/67a5jCx2sC7g24n3BANjNu5VPTuuearijVa6Jiu13kwvohyGUHno1TsQCk7eB1sv7ECN8VTJt3JWgtnsfaypJXqT?cluster=devnet) |
| 2026-10-26 16:27:04 | demo (a): crank green -> amber (update) | [`3wK47pGCtVRzSMMg…`](https://explorer.solana.com/tx/3wK47pGCtVRzSMMgPL66hA2NqqTRr2a5TJ4YifF7fZR6MMcHkeG39xjyD9GZgLddkMAsSonLE22BZiXDMLRvHNLs?cluster=devnet) |
| 2026-10-26 16:27:13 | demo (b): squads configTransactionCreate SetTimeLock 0 | [`34W6RFohR81Equeb…`](https://explorer.solana.com/tx/34W6RFohR81EquebWHBgp291mB3uPxyM97hWJG2WVS7k1QBnuvCMuVJuyr8XGLyVDHfd8PeyuMzTdHivBeHqQ1Ai?cluster=devnet) |
| 2026-10-26 16:27:46 | demo (b): squads proposalCreate | [`2iwMoqdkqQcoanSD…`](https://explorer.solana.com/tx/2iwMoqdkqQcoanSDPmWuD894NUkYJwYFSJHqShgBB7w4KgGDDpLtW7WgpkX6eb5bSwgWzYmVby1deJ5i9XfNi4HA?cluster=devnet) |
| 2026-10-26 16:27:47 | demo (b): squads proposalApprove BtbTbzkQ | [`5o8SCKFmTFK7mimu…`](https://explorer.solana.com/tx/5o8SCKFmTFK7mimuH2Rw7THrB9ZGLwwB5vc3vDh2bHvnC3yu2gDQsfCDHN4JAkDP9AYBhEMxyHTuZ6jcN2pvP4yH?cluster=devnet) |
| 2026-10-26 16:27:48 | demo (b): squads proposalApprove 3hGQ1BN8 | [`2roBSbtEQv2Urias…`](https://explorer.solana.com/tx/2roBSbtEQv2Urias18pHhwudevfo7ehxac8NwedRLECkcaBWMEPuBmnKcebX7qkefFGYKAUnFsND7ixjyhBTbskK?cluster=devnet) |
| 2026-10-26 16:27:50 | demo (b): squads proposalApprove 6AQq43h8 | [`2VNvfax9Z7hsrPtb…`](https://explorer.solana.com/tx/2VNvfax9Z7hsrPtbZQ75TfgyzvP5tVSSfchvbcGCzH8yxyyJnkrhD97hcxoJE9CJvH9HFaFGSLujnxKJQWNyMWBv?cluster=devnet) |
| 2026-10-27 12:42:00 | oracle extend; upgrade with pending-upgrade proofs (deployed slot 515696422) | [`3oXifFVPDFH2iLQ1…`](https://explorer.solana.com/tx/3oXifFVPDFH2iLQ1A5AtXEVUrvxSpaow1o7R3DAv4bd6TWwNHCkgsXKjuyqVzFcYfaULiBxE6bdguWeZPrTYx1Ny?cluster=devnet) |
| 2026-10-27 12:44:00 | vault extend; upgrade with tranche exits (deployed slot 515696727) | [`64L9iCQDTdUM5qCG…`](https://explorer.solana.com/tx/64L9iCQDTdUM5qCGwXUTNRZUrCxLPw31k1vVjokNJgGbCftqsrYv9FoCkhqJF1GVexTEu37LHDMRGv5amHGYUdGG?cluster=devnet) |
| 2026-10-27 16:39:31 | demo (b): squads configTransactionExecute (time_lock = 0) | [`bFBeNBaxQZ8VDwcp…`](https://explorer.solana.com/tx/bFBeNBaxQZ8VDwcpnZgnCreLGbbGSF7mH1fsTfgLT8RoLsvKoMkQB7YbenUMU1k17TZmD3b1cu15JEKm6XQp2PS?cluster=devnet) |
| 2026-10-27 16:39:37 | demo (b): crank amber -> red (update+exit) | [`55qkc45xFQn4RuLJ…`](https://explorer.solana.com/tx/55qkc45xFQn4RuLJkaKSycrupXCypgo881hWfveoGpuHtV4GkETrDbvSzhTwE6Z8dRk1ocjdgMf1AXs7LpL1Sx6V?cluster=devnet) |
| 2026-10-27 21:41:03 | upgrade pexiz_oracle (fast canary timing) | [`2GNjwbHpMnQqidj3…`](https://explorer.solana.com/tx/2GNjwbHpMnQqidj3JPng6wvPjH62j6EbH5wcP7MEoVewYtgaAruJKjs7AU2t4GYYsaHp4Wt4QihY6p7ZYoZJWYcj?cluster=devnet) |
| 2026-10-27 21:41:09 | fast: deploy fast_canary | [`3ZgtGdw9fj7jmie9…`](https://explorer.solana.com/tx/3ZgtGdw9fj7jmie9EV73Dr26LSNjpRW7XhYyegCts9Hn62XgJcJix5GXD1CBp1PjGUS7A6FzDn4Ek5WycdK8j9Yg?cluster=devnet) |
| 2026-10-27 21:41:18 | fast: squads multisigCreateV2 3-of-5, 60 s timelock | [`3ufhhTeHwzJCm4jf…`](https://explorer.solana.com/tx/3ufhhTeHwzJCm4jfD7TEezK2CBExonRCQjQ6r4Ayctnfb9nzzrR2a5JctWwHzyK9Xga9A8fopQFE1NhuhqqzVGgk?cluster=devnet) |
| 2026-10-27 21:41:19 | fast: upgrade authority -> squads vault | [`29GcbfcwRnQnfrMe…`](https://explorer.solana.com/tx/29GcbfcwRnQnfrMeger2apX49HtemsqP27WnEura78yqGhbxmk9sCZjNVRcq4thVhQ2DsUVqUnSYehon2FJy1oo3?cluster=devnet) |
| 2026-10-27 21:41:20 | fast: oracle register_venue | [`zHbyNFrxjQFC1rK9…`](https://explorer.solana.com/tx/zHbyNFrxjQFC1rK9wik7tLCXWpxBiTAsNcA4pp7dcQoWCa6cyCXSmVHuv79TeJzsQnAQuto2ubsDv1PnZf37fsB?cluster=devnet) |
| 2026-10-27 21:42:38 | fast: squads SetTimeLock 0 executed | [`3uH3aARfcaCDmtwK…`](https://explorer.solana.com/tx/3uH3aARfcaCDmtwKmXpvv19iZ1QV5NzUQ2667BYFLLCXkzDgkipHJiTZiLehaH3V6Dt44eeZFAPsfThJKnj7yoqB?cluster=devnet) |
| 2026-10-27 21:42:59 | fast: attack crank green -> red (update) | [`4AueHrfEwRe3m9dy…`](https://explorer.solana.com/tx/4AueHrfEwRe3m9dyhvBqGVuyKfAExUFnKB8WL5bCvmuuRR6xtKm1HfJcnMzmjfeT3jdwU1jmPif5aU3FmbxPoAUp?cluster=devnet) |
| 2026-10-27 21:43:35 | fast: squads SetTimeLock 60 executed | [`5ncdPGY3F8Abtp1J…`](https://explorer.solana.com/tx/5ncdPGY3F8Abtp1JWVGnu3s7miBrSTouvyJ2c3Ts3y6q844wirswwzoTFLSCSkDUAev8WPecmSFqg6dFAo9hx7vV?cluster=devnet) |
| 2026-10-27 21:43:50 | fast: restore crank red -> red (update) | [`5dZVFJ3AzWxAQkx5…`](https://explorer.solana.com/tx/5dZVFJ3AzWxAQkx5Ps1Ca4tX9BT5aUvZVLukmh875VQLkqSWXMfk2sBJ3dk8mK9SX1qty5zrTtAxhqVygDy1QE1R?cluster=devnet) |
| 2026-10-27 21:44:05 | close demo (a) nonce account so the fast canary starts clean | [`55YKygmiZfABz1Q2…`](https://explorer.solana.com/tx/55YKygmiZfABz1Q2SbgxQc9wgYEbdtVaJrKPdZ9b2xyaHZXMAvAZbzNs98ZecNzfMBUBZSCxtCdYBHpf1dAYjRoN?cluster=devnet) |
| 2026-10-27 21:44:29 | fast: nonce gone crank red -> red (update) | [`44m83sXCc8Sq5bYR…`](https://explorer.solana.com/tx/44m83sXCc8Sq5bYRqTPRkLDSGF3TwKktZnWiaSLjikCbvZ3wEV65wfc3NZ1f3hx8EjvWU55mnQjNzissLPLVnmYk?cluster=devnet) |
| 2026-10-27 21:49:52 | fast: after 5 min clear crank red -> green (update) | [`2YLfDYwFZVHVpiif…`](https://explorer.solana.com/tx/2YLfDYwFZVHVpiifS8jPxGy4scDvz6DkBf4NbknL2ruvMjuv6p6zmtGHQZaZgAiWK4asteZvrTdBCzrx1ezwg8tX?cluster=devnet) |
