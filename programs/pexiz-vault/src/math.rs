//! Share accounting. Every division rounds toward the vault, so the vault
//! never pays out more than it holds.

/// Shares minted for `deposit` into a vault worth `nav` with `supply` shares.
pub fn shares_for_deposit(deposit: u64, nav: u64, supply: u64) -> Option<u64> {
    if supply == 0 {
        return Some(deposit);
    }
    if nav == 0 {
        return None;
    }
    u64::try_from(deposit as u128 * supply as u128 / nav as u128).ok()
}

/// Pro-rata part of `holding` owed to `shares` out of `supply`.
pub fn pro_rata(holding: u64, shares: u64, supply: u64) -> u64 {
    if supply == 0 {
        return 0;
    }
    (holding as u128 * shares.min(supply) as u128 / supply as u128) as u64
}

/// True when `votes` is at least half of `supply`.
pub fn majority(votes: u64, supply: u64) -> bool {
    supply > 0 && votes as u128 * 2 >= supply as u128
}

/// What `lp` LP tokens are worth, at the pool's own value per token
/// (`aum / lp_supply`). Rounds down, so the vault never values itself high.
pub fn lp_value_usdc(lp: u64, aum: u64, lp_supply: u64) -> Option<u64> {
    if lp == 0 {
        return Some(0);
    }
    if lp_supply == 0 {
        return None;
    }
    u64::try_from(lp as u128 * aum as u128 / lp_supply as u128).ok()
}

/// Least USDC an exit tranche of `lp` may return: the pool's own value per LP
/// token (`reserve / lp_supply`) less `MAX_EXIT_SLIPPAGE_BPS`, rounded up.
pub fn exit_floor(lp: u64, reserve: u64, lp_supply: u64) -> Option<u64> {
    if lp_supply == 0 {
        return None;
    }
    let keep = 10_000 - crate::MAX_EXIT_SLIPPAGE_BPS as u128;
    let num = lp as u128 * reserve as u128 * keep;
    let den = lp_supply as u128 * 10_000;
    u64::try_from(num.div_ceil(den)).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn first_deposit_is_one_to_one() {
        assert_eq!(shares_for_deposit(5, 0, 0), Some(5));
    }

    #[test]
    fn empty_nav_with_shares_refuses_deposit() {
        assert_eq!(shares_for_deposit(5, 0, 10), None);
    }

    #[test]
    fn exit_floor_is_one_percent_under_pool_value() {
        // 1:1 pool: 1,000 LP must fetch at least 990 USDC.
        assert_eq!(exit_floor(1_000, 5_000, 5_000), Some(990));
        // Pool worth 2 USDC per LP.
        assert_eq!(exit_floor(1_000, 10_000, 5_000), Some(1_980));
        assert_eq!(exit_floor(1, 1, 0), None);
    }

    #[test]
    fn canary_redemption_clears_the_floor() {
        // Canary pays 1:1 less 10 bps; the floor allows 100 bps.
        let lp = 1_000_000_000;
        assert!(canary_venue::redeem_amount(lp) >= exit_floor(lp, lp, lp).unwrap());
    }

    #[test]
    fn lp_is_valued_at_the_pools_own_price() {
        // The live JLP pool on 27 Oct 2026: $844,315,343,474,555 of AUM over
        // 189,042,592,013,553 JLP is $4.4663 a token, so 1,000 JLP is
        // $4,466.27. The fork test redeemed 1,000 JLP for $4,455.
        assert_eq!(lp_value_usdc(1_000_000_000, 844_315_343_474_555, 189_042_592_013_553), Some(4_466_270_455));
        // An empty pool has no price, and no LP is worth nothing either way.
        assert_eq!(lp_value_usdc(1, 1, 0), None);
        assert_eq!(lp_value_usdc(0, 1, 0), Some(0));
    }

    #[test]
    fn a_jlp_vault_values_itself_low_rather_than_high() {
        // Rounding is toward the vault: never credit a depositor with more
        // than the LP already in the vault is worth.
        assert_eq!(lp_value_usdc(3, 10, 3), Some(10));
        assert_eq!(lp_value_usdc(1, 10, 3), Some(3));
    }

    #[test]
    fn majority_is_half_or_more() {
        assert!(majority(50, 100));
        assert!(!majority(49, 100));
        assert!(!majority(0, 0));
    }

    proptest! {
        /// Paying every holder pro rata never exceeds the holding.
        #[test]
        fn pro_rata_never_overpays(holding in 0u64..u64::MAX / 2, parts in proptest::collection::vec(1u64..1_000_000_000_000, 1..20)) {
            let supply: u64 = parts.iter().sum();
            let paid: u128 = parts.iter().map(|s| pro_rata(holding, *s, supply) as u128).sum();
            prop_assert!(paid <= holding as u128);
        }

        /// A depositor never gets shares worth more than they paid.
        #[test]
        fn deposit_never_dilutes_others(dep in 1u64..1_000_000_000_000, nav in 1u64..1_000_000_000_000, supply in 1u64..1_000_000_000_000) {
            let s = shares_for_deposit(dep, nav, supply).unwrap();
            prop_assert!(s as u128 * nav as u128 <= dep as u128 * supply as u128);
        }
    }
}
