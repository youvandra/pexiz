# Trust model

## What Pexiz trusts

- **The Squads v4 account layout and PDA seeds.** Checked against the
  `squads-multisig-program` 2.0.0 source ([open-questions.md](open-questions.md)).
  A Squads upgrade that changes the layout breaks parsing. `update` then
  fails rather than misreads.
- **The System program's nonce semantics.** An initialized nonce account's
  authority can sign transactions now that land later.
- **The Clock sysvar** for every duration.
- **The venue's redeem path** (canary `remove_liquidity`, later Jupiter
  `removeLiquidity2`) to pay out on `exit`. `min_usdc_out` bounds the loss.

## What Pexiz does not trust

- **Reporters.** Updates are permissionless. The program recomputes every
  condition from the accounts passed in and checks each account's address
  or owner.
- **The crank.** Anyone can run it. A crank that sends no proofs cannot
  cause red; at worst it delays amber. A crank that sends a bad proof fails
  its own transaction.

## The exit program

`pexiz-exit` holds token delegations for every guarded holder under one PDA,
so it is the part an attacker would aim at. Reviewed on 28 Oct 2026:

- **Whose LP.** An exit only touches a token account owned by the guard's
  holder (`token::authority = guard.holder`), and a guard is created only by
  that holder's signature, at a PDA of their key and the LP mint.
- **Where the USDC goes.** The payout account is fixed when the guard is
  opened, must be owned by the holder then, and is checked by key on every
  exit. The keeper names only their own fee account.
- **What it calls.** The canary program and Jupiter Perps are pinned by id,
  and the Jupiter call is `removeLiquidity2` with the LP taken from the
  program's own route account. The route accounts pay out only the USDC an
  exit just produced, measured before and after.
- **When.** Only on a red flag, read from an account the oracle owns. A
  guard cannot be opened on a venue that is already red: the holder would
  pay a keeper for an exit they can make themselves.
- **How much.** Up to what the holder approved and still holds, in tranches
  the caller sizes, each at no worse than 1% under the pool's value per LP
  token. Before the review an exit always took everything at once, so a
  position larger than the pool could absorb within the floor could never
  leave; that is fixed.

What it still trusts or cannot help:

- **The venue's registration.** The flag is only as strict as the venue's
  `min_time_lock_secs` (see "first registrant wins" below). Check a venue's
  parameters before guarding with it.
- **The holder's own accounts.** If the holder delegates the same token
  account to another program, freezes or closes the payout account, the
  guard stops working until they guard again. The app shows the guarded
  amount from the live delegation.
- **Upgrades.** On devnet the program is still upgradeable by the deploy
  key. On mainnet it ships with its upgrade authority removed.
- **The pools.** Jupiter Perps and the canary are trusted to honour their
  own redemption. A Jupiter upgrade is itself watched by the oracle.

## Liveness

Exit happens only when someone calls `update` (and `exit`). Pexiz runs a
crank. Anyone else can run the same code, and the vault's `exit` is
permissionless. The crank sends a transaction only when the simulated state
differs from the stored one, so idle cycles cost nothing.

## Known gaps

- **What an upgrade does.** The oracle sees that an approved proposal would
  upgrade the program and warns (amber). It cannot judge the new code, so
  the vault never exits on an upgrade alone. See
  [exits-and-losses.md](exits-and-losses.md).
- **Tranche sizing on priced pools.** The program enforces a 1% floor per
  exit tranche; the crank sizes tranches for the fixed-rate canary pool
  only.

- **Venue-level admin keys.** v1 watches the program upgrade authority and
  the multisig that holds it. A venue whose admin key in its own state
  differs from that multisig needs that admin's multisig registered, which
  the current `register_venue` does not support (it requires the multisig's
  vault to be the upgrade authority). The 1 Apr 2026 attack went through
  `UpdateAdmin`, executed by the Security Council multisig.
- **Controlled multisigs.** A Squads multisig with a non-default
  `config_authority` can change members, threshold and timelock without a
  proposal. The oracle parses `config_authority` but does not flag it yet.
- **First registrant wins.** Someone can register a venue first with weak
  parameters, for example `min_time_lock_secs = 0`. The values are public
  on chain. A `reregister` that only refreshes from chain is planned; until
  then, check a venue's parameters before trusting its flag.
- **Pre-signing is a warning only.** `InitializeNonceAccount` takes the
  authority as data and needs no signature from it, so anyone can create a
  nonce account naming a multisig member for a few lamports. Counting that
  as proof would let a stranger force every guarded holder out. So
  `SIGNER_PRESIGNING` holds the flag at amber (deposits pause, alerts fire)
  and after 48 h adds `AMBER_ESCALATED`, but only a config change turns it
  red. The cost: on the April 2026 replay the exit moves from 25 Mar to the
  27 Mar timelock cut, still 5 d 16 h before the takeover. The check is also
  blind to a nonce whose authority is not a member, even when a member
  co-signs the transaction it carries.
- **Exit capacity.** The vault's AUM cap ($10M) comes from JLP→USDC price
  impact measured on 26 Oct 2026. Capacity changes with pool depth and
  needs re-measuring.
- **Synthetic test accounts.** Oracle tests use Squads-layout accounts with
  measured parameters but generated members. `scripts/measure/fixtures.py`
  swaps in the real mainnet accounts once RPC is available.
