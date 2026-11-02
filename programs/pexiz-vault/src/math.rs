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

/// True when a share supply is empty or at least `MIN_SHARES` deep.
pub fn deep_enough(supply: u64) -> bool {
    supply == 0 || supply >= crate::MIN_SHARES
}

/// What a vault holding `usdc` and `lp` is worth, with each LP token priced at
/// what a deposit just paid: `paid` USDC for `bought` LP. Rounds up, toward
/// the vault, so the depositor's shares are never rounded in their favour.
pub fn nav_at_paid_price(usdc: u64, lp: u64, paid: u64, bought: u64) -> Option<u64> {
    if lp == 0 {
        return Some(usdc);
    }
    if bought == 0 {
        return None;
    }
    let lp_value = u64::try_from((lp as u128 * paid as u128).div_ceil(bought as u128)).ok()?;
    usdc.checked_add(lp_value)
}

/// The keeper's cut of an exit tranche that fetched `out`, rounded down.
pub fn keeper_fee(out: u64) -> u64 {
    (out as u128 * crate::KEEPER_FEE_BPS as u128 / 10_000) as u64
}

/// What the canary pool's reserve is worth to its LP tokens. The canary
/// redeems at a fixed 1 USDC per LP less its fee, and the fee stays in the
/// reserve, so a reserve above the LP supply does not raise what one LP
/// redeems for. Valuing it higher would set a floor no redemption can meet.
pub fn canary_backing(reserve: u64, lp_supply: u64) -> u64 {
    reserve.min(lp_supply)
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
    fn a_supply_is_empty_or_one_usdc_deep() {
        assert!(deep_enough(0));
        assert!(!deep_enough(1));
        assert!(!deep_enough(999_999));
        assert!(deep_enough(1_000_000));
    }

    #[test]
    fn held_lp_is_valued_at_the_price_just_paid() {
        // $5,000 bought 1,119.5 JLP; 2,000 JLP already held is then worth
        // $8,932.56, rounded up.
        assert_eq!(nav_at_paid_price(0, 2_000_000_000, 5_000_000_000, 1_119_500_000), Some(8_932_559_179));
        assert_eq!(nav_at_paid_price(7, 0, 5, 0), Some(7));
        assert_eq!(nav_at_paid_price(0, 1, 5, 0), None);
    }

    #[test]
    fn keeper_fee_is_a_tenth_of_a_percent_rounded_down() {
        assert_eq!(keeper_fee(1_000_000), 1_000);
        assert_eq!(keeper_fee(999), 0);
    }

    #[test]
    fn a_donation_cannot_rob_the_next_depositor() {
        // The attacker holds the minimum supply and donates $1M to inflate the
        // price per share; the victim then deposits $10k.
        let (supply, nav) = (crate::MIN_SHARES, crate::MIN_SHARES + 1_000_000_000_000);
        let dep = 10_000_000_000u64;
        let shares = shares_for_deposit(dep, nav, supply).unwrap();
        let back = pro_rata(nav + dep, shares, supply + shares);
        // The victim loses less than one share's worth, about $1.
        assert!(dep - back < nav / supply + 1);
        assert!(dep - back <= 1_000_001);
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
