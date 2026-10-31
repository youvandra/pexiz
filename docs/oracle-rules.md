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
| `1 << 5` | `AMBER_ESCALATED` | `SIGNER_PRESIGNING` has held continuously for 48 h; marks the amber, never turns it red |
| `1 << 6` | `UPGRADE_PENDING` | the venue remembers an approved Squads proposal whose vault transaction would upgrade, re-authorise or close the program |

Member replacement counts members present now that were absent at the
previous update. The count accumulates in a window that opens with the first
replacement and closes 7 days later. "More than a third" compares against the
member count when the window opened. The oracle stores the member list (up
to 16; measured venues have 7 or 8) to make this count.

## Flag

- **Red** if any of `TIME_LOCK_BELOW_MIN`, `THRESHOLD_DROPPED`,
  `MEMBERS_REPLACED` or `UPGRADE_AUTHORITY_MOVED` holds.
- **Amber** if only `SIGNER_PRESIGNING` (with or without `AMBER_ESCALATED`)
  or `UPGRADE_PENDING` holds. A red flag never steps down to amber.
  Pre-signing never turns the flag red: a nonce account can name any key
  as its authority without that key's signature, so it proves nothing about
  what a member signed.
- **Green** only once no condition has held for `COOL_OFF_SECS` (7 days),
  tracked by `clear_since`. Any condition during the cool-off restarts it.
  One exception: an amber raised only by `UPGRADE_PENDING` returns to green
  as soon as the proposal is executed, cancelled, rejected or closed.
  Upgrades are routine; a week of paused deposits after each one would teach
  depositors to ignore the flag.

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
amber holds, escalates to `AMBER_ESCALATED` after 48 h, and cannot clear. Someone who
controls the nonce, and spams updates without it, changes nothing. The
crank passes every remembered account each cycle, which is how dead ones
are cleared.

Pending upgrades work the same way. The proof is a pair of Squads accounts:
a `Proposal` with status Approved or Executing, and its `VaultTransaction`
from the registered vault index, holding a BPF upgradeable loader
instruction (Upgrade, SetAuthority, Close or SetAuthorityChecked) whose
first account is the venue's program data. Both accounts must be owned by
Squads v4 and name the registered multisig; a proposal of another multisig
fails the transaction (`BadUpgradeProof`). If the first account comes from
an address lookup table it cannot be resolved on chain and is counted:
hiding the target is itself the warning. Up to 4 indices are remembered in
`pending_upgrades`. One is dropped only when its proposal is passed
executed, cancelled or rejected, or its address is passed holding no
proposal.

`UPGRADE_PENDING` never turns the flag red and never triggers an exit. The
oracle cannot tell a routine upgrade from a malicious one; it can only say
that one is coming and when it can land. Deposits pause, and every
depositor sees the warning while the timelock still stands between the
approval and their money.

On 27 Oct 2026 this already finds something on mainnet: Jupiter Perps
proposal #20, an upgrade of the Perps program approved on 7 Aug 2026, is
still waiting. Its buffer exists, so a member can execute it at any time
with no delay left.

A cranker who misses a new proof can delay amber. No input can produce a
false red: every red bit is computed from the multisig, the program data,
the remembered proof accounts and the clock.

## The fast canary

One program runs on minutes instead of days: `FAST_CANARY_PROGRAM`
(`432t9qKLgxBAZjy9LBuPSAuJBtPP52gM6ZW4o1r8fBqj`), a devnet program with no
instructions whose upgrade authority sits under a 3 of 5 Squads multisig
with a 60 s timelock. It exists so a visitor can watch a whole attack, exit
and recovery in one sitting. The oracle picks its durations by the watched
program id (`timing()` in `lib.rs`), so no registration can ask for them:

| Duration | Every venue | Fast canary |
|---|---|---|
| Cool-off before green | 7 days | 5 minutes |
| Pre-signing before `AMBER_ESCALATED` | 48 h | 2 minutes |
| Member-replacement window | 7 days | 5 minutes |

The rules are otherwise the same code path (`rules::step_timed`).

## Tested properties

- Host (`cargo test -p pexiz_oracle`): one test per rule, plus a proptest
  over 2,000 random sequences of config changes and time steps. Red always
  carries a hard reason; a non-green flag always has
  reasons; green is never set while a condition holds; a return to green
  always follows a full cool-off.
- On chain (`tests/oracle.test.ts`, LiteSVM): one test per reason bit, the
  escalation timeline and cool-off with clock warps, rejected fake proofs
  (wrong owner, uninitialized, non-member, wrong size, removed member),
  rejected program-data and multisig accounts, and a random-sequence test
  with the same invariants.

## The mainnet board

The web app's protocol monitor reads mainnet directly and uses one more
status, which the on-chain oracle does not have. **No delay** marks a
protocol set up so approved changes land sooner than a user could withdraw:
a standing risk with nothing new behind it. The board saves **Get out** for
a change for the worse against the measured snapshot (`app/src/data/facts.ts`):
a shorter delay, fewer approvals needed, or upgrade control moved away. A
vault never enters a No delay protocol, so for the vault both mean "out".
