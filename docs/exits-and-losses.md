# Exits, queues and losses

Three questions every depositor should ask, and what Pexiz answers today.

## Who gets out first when liquidity runs short?

Between the vault and everyone else, the vault does. Its exit lands in the
same transaction as the oracle update that turns the flag red, before any
person can react. That priority comes from speed, and it is finite: the
vault caps deposits at $10M because that is what JLP can absorb under 1%
price impact (measured 26 Oct 2026).

Inside the vault there is no queue. Every depositor owns a pro-rata share of
whatever the vault holds, LP before an exit and USDC after, and withdraws it
in any state.

When the pool cannot take the whole position at once, the exit leaves in
tranches (`exit(lp_amount, min_usdc_out)`). The first tranche marks the vault
exited and closes deposits; later tranches follow in later calls until no LP
is left. Each tranche must return at least the pool's own value per LP token
less 1% (`MAX_EXIT_SLIPPAGE_BPS`), computed by the program from the pool's
reserve and LP supply, so a permissionless caller cannot force a fire sale.
Withdrawals between tranches pay the same pro-rata mix of LP and USDC.

The canary pool redeems at a fixed rate, so its crank sells everything in one
tranche. A pool with price impact needs the crank to size each tranche from a
quote; that sizing is not written yet.

## Does Pexiz compensate losses?

No. Pexiz is not insurance and holds no fund to pay claims. It lowers the
chance of being caught by an admin takeover; it does not cover what it
misses. Losses it can still leave you with:

- **A false alarm.** The vault exits, the venue turns out fine, and you lose
  the yield and the swap costs until re-entry.
- **Slippage** on an exit, up to 1% per tranche.
- **An attack the oracle cannot see.** The oracle reads how the admin path
  is configured and whether an upgrade has been approved. It does not read
  what an upgrade's code does. An approved upgrade raises a warning and
  pauses deposits, but the vault does not leave on it.

## Protection, or a faster scramble?

It depends on whether the exit is crowded.

In the warning window it is protection. In April 2026 the warning sat on
chain for nine days and 0.8% of LP supply left. The door was wide open and
almost nobody used it. A vault that leaves then takes nothing from other
LPs: the loss it avoids is the attacker's gain, not another depositor's.

It becomes a scramble only when everyone uses the same exit at the same
time. Then whoever leaves first gets the better price. The per-vault cap and
the tranche floor limit that, and the Monitor is public and free, so the
warning reaches every LP, depositor or not.
