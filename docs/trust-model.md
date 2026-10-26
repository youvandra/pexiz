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

## Liveness

Exit happens only when someone calls `update` (and `exit`). Pexiz runs a
crank. Anyone else can run the same code, and the vault's `exit` is
permissionless. The crank sends a transaction only when the simulated state
differs from the stored one, so idle cycles cost nothing.

## Known gaps

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
- **Escalated red without a config change.** Amber escalates to red after
  48 h. That red reflects a standing pre-signing capability, not a change
  already made. This is deliberate: the April 2026 attack used nonce accounts
  created 9 days before the takeover.
- **Exit capacity.** The vault's AUM cap ($10M) comes from JLP→USDC price
  impact measured on 26 Oct 2026. Capacity changes with pool depth and
  needs re-measuring.
- **Synthetic test accounts.** Oracle tests use Squads-layout accounts with
  measured parameters but generated members. `scripts/measure/fixtures.py`
  swaps in the real mainnet accounts once RPC is available.
