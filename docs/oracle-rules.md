# Oracle rules

Source: `programs/pexiz-oracle/src/rules.rs`. Every duration uses the
`Clock` sysvar's `unix_timestamp`, never a slot count: 200 ms slots went
live on 9 Oct 2026, we measured 211 ms, and the figure keeps moving.

## Conditions

Each `update` recomputes these from the accounts passed in.

| Bit | Name | Holds when |
|---|---|---|
| `1 << 0` | `TIME_LOCK_BELOW_MIN` | the multisig `time_lock` is below the venue's `min_time_lock_secs` |
| `1 << 1` | `THRESHOLD_DROPPED` | the threshold is below the baseline: the threshold last accepted while green |
| `1 << 2` | `MEMBERS_REPLACED` | more than a third of members were replaced within a rolling 7-day window |
| `1 << 3` | `UPGRADE_AUTHORITY_MOVED` | the program-data authority is not the registered Squads vault, or is None |
| `1 << 4` | `SIGNER_PRESIGNING` | the venue remembers at least one live pre-signing account: a System nonce account (owner System, 80 bytes, `state == 1`) whose authority is a current member |
| `1 << 5` | `AMBER_ESCALATED` | `SIGNER_PRESIGNING` has held continuously for 48 h |

Member replacement counts members present now that were absent at the
previous update. The count accumulates in a window that opens with the first
replacement and closes 7 days later. "More than a third" compares against the
member count when the window opened. The oracle stores the member list (up
to 16; measured venues have 7 or 8) to make this count.

## Flag

- **Red** if any of `TIME_LOCK_BELOW_MIN`, `THRESHOLD_DROPPED`,
  `MEMBERS_REPLACED`, `UPGRADE_AUTHORITY_MOVED` or `AMBER_ESCALATED` holds.
- **Amber** if only `SIGNER_PRESIGNING` holds. A red flag never steps down
  to amber.
- **Green** only once no condition has held for `COOL_OFF_SECS` (7 days),
  tracked by `clear_since`. Any condition during the cool-off restarts it.

`reasons` latches every bit seen since the flag last left green, so a red
flag always carries the reason that raised it, even during the cool-off.
`active_reasons` holds the bits of the latest update. When the flag is
green, the current threshold becomes the baseline, so a raised threshold
is accepted at once. A lowered threshold keeps the flag red. If it stays
lowered for a full 7 days (`low_threshold_since`), it becomes the new
baseline: depositors have had that week to leave, and the flag still needs
another 7-day cool-off before it turns green. An unrelated earlier red does
not shorten that week.

## What a proof can and cannot do

The program recomputes every signal and trusts no reporter. A proof
account either passes the verifier or fails the whole transaction
(`BadPresigningProof`), so a forged proof cannot be slipped in alongside a
real one.

The absence of a pre-signing account cannot be proven, so the oracle never
treats a missing proof as evidence. A pre-signing account that proves
itself is remembered in `presigners` (up to 8). It is dropped only when it
is passed again and fails the verifier: closed, uninitialized, or
controlled by a key that is no longer a member. Until then
`SIGNER_PRESIGNING` holds on every update, with or without proofs, so
amber keeps escalating to red after 48 h and cannot clear. Someone who
controls the nonce, and spams updates without it, changes nothing. The
crank passes every remembered account each cycle, which is how dead ones
are cleared.

A cranker who misses a new proof can delay amber. No input can produce a
false red: every red bit is computed from the multisig, the program data,
the remembered proof accounts and the clock.

## Tested properties

- Host (`cargo test -p pexiz_oracle`): one test per rule, plus a proptest
  over 2,000 random sequences of config changes and time steps. Red always
  carries a hard reason or `AMBER_ESCALATED`; a non-green flag always has
  reasons; green is never set while a condition holds; a return to green
  always follows a full cool-off.
- On chain (`tests/oracle.test.ts`, LiteSVM): one test per reason bit, the
  escalation timeline and cool-off with clock warps, rejected fake proofs
  (wrong owner, uninitialized, non-member, wrong size, removed member),
  rejected program-data and multisig accounts, and a random-sequence test
  with the same invariants.
