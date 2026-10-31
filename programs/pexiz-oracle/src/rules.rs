//! Flag state machine. Pure functions, so the rules can be tested and fuzzed
//! on the host without a validator.

use crate::{reason, Flag, AMBER_ESCALATION_SECS, COOL_OFF_SECS, MEMBERS_WINDOW_SECS};

/// Reason bits that turn the flag red on their own.
pub const HARD_MASK: u32 = reason::TIME_LOCK_BELOW_MIN
    | reason::THRESHOLD_DROPPED
    | reason::MEMBERS_REPLACED
    | reason::UPGRADE_AUTHORITY_MOVED;

/// How long each rule waits. Every venue runs on `STANDARD` except the fast
/// canary (`crate::FAST_CANARY_PROGRAM`), which runs on `FAST`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Timing {
    /// A flag must stay clear this long before it returns to green.
    pub cool_off: i64,
    /// Pre-signing that holds this long is marked `AMBER_ESCALATED`. The flag
    /// stays amber: anyone can create a nonce account naming a member as its
    /// authority, so pre-signing alone is never proof enough to force exits.
    pub amber_escalation: i64,
    /// Rolling window for counting replaced members.
    pub members_window: i64,
}

impl Timing {
    pub const STANDARD: Timing = Timing {
        cool_off: COOL_OFF_SECS,
        amber_escalation: AMBER_ESCALATION_SECS,
        members_window: MEMBERS_WINDOW_SECS,
    };
    pub const FAST: Timing = Timing { cool_off: 5 * 60, amber_escalation: 2 * 60, members_window: 5 * 60 };
}

/// What an update observed on chain, already reduced to facts.
#[derive(Clone, Copy, Debug, Default)]
pub struct Observation {
    pub threshold: u16,
    pub time_lock_secs: u32,
    pub member_count: u16,
    /// Members present now that were absent at the previous observation.
    pub newly_replaced: u16,
    pub authority_moved: bool,
    pub presigning: bool,
    /// An approved proposal would upgrade, re-authorise or close the program.
    pub upgrade_pending: bool,
}

/// The part of `Venue` the rules read and write.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RuleState {
    pub flag: Flag,
    /// Reasons latched since the flag last left green.
    pub reasons: u32,
    /// Reasons that hold at the latest update.
    pub active_reasons: u32,
    pub amber_since: i64,
    pub red_since: i64,
    pub clear_since: i64,
    /// Threshold accepted while green; a drop below it is red.
    pub baseline_threshold: u16,
    pub min_time_lock_secs: u32,
    pub replaced_7d: u16,
    pub replaced_window_start: i64,
    /// Member count when the replacement window opened.
    pub replaced_window_base: u16,
    /// When the threshold first fell below the baseline; 0 while it is not.
    pub low_threshold_since: i64,
}

/// An amber raised only by a pending upgrade. Upgrades are routine, so once
/// the proposal is executed or dropped the flag returns to green at once,
/// without the cool-off.
fn upgrade_only(latched: u32) -> bool {
    latched != 0 && latched & !reason::UPGRADE_PENDING == 0
}

/// Applies one observation at time `now` on standard timing. Returns the
/// previous flag.
pub fn step(s: &mut RuleState, o: &Observation, now: i64) -> Flag {
    step_timed(s, o, now, &Timing::STANDARD)
}

/// Applies one observation at time `now`. Returns the previous flag.
pub fn step_timed(s: &mut RuleState, o: &Observation, now: i64, t: &Timing) -> Flag {
    let from = s.flag;

    // Rolling member-replacement window.
    if s.replaced_7d > 0 && now - s.replaced_window_start >= t.members_window {
        s.replaced_7d = 0;
    }
    if o.newly_replaced > 0 {
        if s.replaced_7d == 0 {
            s.replaced_window_start = now;
            s.replaced_window_base = o.member_count.max(1);
        }
        s.replaced_7d = s.replaced_7d.saturating_add(o.newly_replaced);
    }

    // A threshold that has stayed below the baseline for a full cool-off is
    // accepted as the new baseline. Depositors have had that week to leave;
    // the flag still needs another clear cool-off before it turns green.
    if o.threshold < s.baseline_threshold {
        if s.low_threshold_since == 0 {
            s.low_threshold_since = now;
        } else if now - s.low_threshold_since >= t.cool_off {
            s.baseline_threshold = o.threshold;
            s.low_threshold_since = 0;
        }
    } else {
        s.low_threshold_since = 0;
    }

    let mut active = 0u32;
    if o.time_lock_secs < s.min_time_lock_secs {
        active |= reason::TIME_LOCK_BELOW_MIN;
    }
    if o.threshold < s.baseline_threshold {
        active |= reason::THRESHOLD_DROPPED;
    }
    if (s.replaced_7d as u32) * 3 > s.replaced_window_base as u32 {
        active |= reason::MEMBERS_REPLACED;
    }
    if o.authority_moved {
        active |= reason::UPGRADE_AUTHORITY_MOVED;
    }
    if o.presigning {
        active |= reason::SIGNER_PRESIGNING;
        if s.amber_since == 0 {
            s.amber_since = now;
        }
        if now - s.amber_since >= t.amber_escalation {
            active |= reason::AMBER_ESCALATED;
        }
    } else {
        s.amber_since = 0;
    }

    if o.upgrade_pending {
        active |= reason::UPGRADE_PENDING;
    }

    if active == 0 {
        if s.clear_since == 0 {
            s.clear_since = now;
        }
    } else {
        s.clear_since = 0;
    }

    let to = if active & HARD_MASK != 0 {
        Flag::Red
    } else if active != 0 {
        // Only pre-signing (escalated or not) or a pending upgrade: amber,
        // but a red flag never steps down to amber.
        if from == Flag::Red {
            Flag::Red
        } else {
            Flag::Amber
        }
    } else if from == Flag::Green || upgrade_only(s.reasons) || now - s.clear_since >= t.cool_off {
        Flag::Green
    } else {
        from
    };

    if to == Flag::Green {
        s.reasons = 0;
        // Accept the current config as the new baseline. A raised threshold
        // or timelock is accepted at once; a lowered one is red, so it never
        // reaches here.
        s.baseline_threshold = o.threshold;
        s.min_time_lock_secs = o.time_lock_secs;
    } else {
        s.reasons |= active;
    }
    if to == Flag::Red && from != Flag::Red {
        s.red_since = now;
    }
    if to != Flag::Red {
        s.red_since = 0;
    }
    s.active_reasons = active;
    s.flag = to;
    from
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const DAY: i64 = 86_400;
    const T0: i64 = 1_774_224_000; // 23 Mar 2026 00:00 UTC

    fn base() -> RuleState {
        RuleState {
            baseline_threshold: 4,
            min_time_lock_secs: 3600,
            ..Default::default()
        }
    }

    fn healthy() -> Observation {
        Observation {
            threshold: 4,
            time_lock_secs: 86_400,
            member_count: 8,
            ..Default::default()
        }
    }

    #[test]
    fn healthy_stays_green() {
        let mut s = base();
        step(&mut s, &healthy(), T0);
        assert_eq!(s.flag, Flag::Green);
        assert_eq!(s.reasons, 0);
    }

    #[test]
    fn each_hard_reason_is_red() {
        let cases: [(Observation, u32); 3] = [
            (Observation { time_lock_secs: 0, ..healthy() }, reason::TIME_LOCK_BELOW_MIN),
            (Observation { threshold: 3, ..healthy() }, reason::THRESHOLD_DROPPED),
            (Observation { authority_moved: true, ..healthy() }, reason::UPGRADE_AUTHORITY_MOVED),
        ];
        for (o, bit) in cases {
            let mut s = base();
            step(&mut s, &o, T0);
            assert_eq!(s.flag, Flag::Red);
            assert_eq!(s.reasons, bit);
            assert_eq!(s.red_since, T0);
        }
    }

    #[test]
    fn members_replaced_needs_more_than_a_third() {
        let mut s = base();
        // 8 members: 2 replaced is a quarter, 3 is more than a third.
        step(&mut s, &Observation { newly_replaced: 2, ..healthy() }, T0);
        assert_eq!(s.flag, Flag::Green);
        step(&mut s, &Observation { newly_replaced: 1, ..healthy() }, T0 + DAY);
        assert_eq!(s.flag, Flag::Red);
        assert_eq!(s.reasons, reason::MEMBERS_REPLACED);
    }

    #[test]
    fn members_window_expires_after_seven_days() {
        let mut s = base();
        step(&mut s, &Observation { newly_replaced: 2, ..healthy() }, T0);
        step(&mut s, &Observation { newly_replaced: 1, ..healthy() }, T0 + 7 * DAY);
        assert_eq!(s.flag, Flag::Green);
        assert_eq!(s.replaced_7d, 1);
    }

    #[test]
    fn fast_timing_runs_the_same_cycle_in_minutes() {
        let t = Timing::FAST;
        let mut s = base();
        let cut = Observation { time_lock_secs: 0, ..healthy() };
        step_timed(&mut s, &cut, T0, &t);
        assert_eq!(s.flag, Flag::Red);
        step_timed(&mut s, &healthy(), T0 + 60, &t);
        step_timed(&mut s, &healthy(), T0 + 60 + 5 * 60 - 1, &t);
        assert_eq!(s.flag, Flag::Red);
        step_timed(&mut s, &healthy(), T0 + 60 + 5 * 60, &t);
        assert_eq!(s.flag, Flag::Green);

        let o = Observation { presigning: true, ..healthy() };
        step_timed(&mut s, &o, T0 + DAY, &t);
        assert_eq!(s.flag, Flag::Amber);
        step_timed(&mut s, &o, T0 + DAY + 2 * 60, &t);
        assert_eq!(s.flag, Flag::Amber);
        assert_ne!(s.reasons & reason::AMBER_ESCALATED, 0);
    }

    #[test]
    fn only_the_fast_canary_gets_fast_timing() {
        assert_eq!(crate::timing(&crate::FAST_CANARY_PROGRAM), Timing::FAST);
        assert_eq!(crate::timing(&crate::ID), Timing::STANDARD);
    }

    #[test]
    fn presigning_stays_amber_and_is_marked_after_48h() {
        let mut s = base();
        let o = Observation { presigning: true, ..healthy() };
        step(&mut s, &o, T0);
        assert_eq!(s.flag, Flag::Amber);
        step(&mut s, &o, T0 + 47 * 3600);
        assert_eq!(s.reasons, reason::SIGNER_PRESIGNING);
        step(&mut s, &o, T0 + 48 * 3600);
        assert_eq!(s.flag, Flag::Amber);
        assert_eq!(s.reasons, reason::SIGNER_PRESIGNING | reason::AMBER_ESCALATED);
        // A month of it still never forces an exit.
        step(&mut s, &o, T0 + 30 * DAY);
        assert_eq!(s.flag, Flag::Amber);
    }

    #[test]
    fn a_raised_timelock_becomes_the_baseline() {
        let mut s = base();
        step(&mut s, &healthy(), T0);
        assert_eq!(s.min_time_lock_secs, 86_400);
        // Cut from 24 h to 12 h: still above the 1 h it was registered with,
        // but below what users were last told it was.
        step(&mut s, &Observation { time_lock_secs: 43_200, ..healthy() }, T0 + DAY);
        assert_eq!(s.flag, Flag::Red);
        assert_eq!(s.reasons, reason::TIME_LOCK_BELOW_MIN);
        // A lowered timelock is never accepted on its own: it needs a rebaseline.
        step(&mut s, &Observation { time_lock_secs: 43_200, ..healthy() }, T0 + 30 * DAY);
        assert_eq!(s.flag, Flag::Red);
    }

    #[test]
    fn presigning_then_a_hard_change_is_red() {
        let mut s = base();
        step(&mut s, &Observation { presigning: true, ..healthy() }, T0);
        step(&mut s, &Observation { presigning: true, time_lock_secs: 0, ..healthy() }, T0 + 3 * DAY);
        assert_eq!(s.flag, Flag::Red);
        assert_ne!(s.reasons & reason::TIME_LOCK_BELOW_MIN, 0);
    }

    #[test]
    fn amber_clears_only_after_cool_off() {
        let mut s = base();
        step(&mut s, &Observation { presigning: true, ..healthy() }, T0);
        step(&mut s, &healthy(), T0 + DAY);
        assert_eq!(s.flag, Flag::Amber);
        assert_eq!(s.active_reasons, 0);
        assert_eq!(s.reasons, reason::SIGNER_PRESIGNING);
        step(&mut s, &healthy(), T0 + DAY + COOL_OFF_SECS - 1);
        assert_eq!(s.flag, Flag::Amber);
        step(&mut s, &healthy(), T0 + DAY + COOL_OFF_SECS);
        assert_eq!(s.flag, Flag::Green);
        assert_eq!(s.reasons, 0);
    }

    #[test]
    fn red_never_steps_down_to_amber() {
        let mut s = base();
        step(&mut s, &Observation { time_lock_secs: 0, presigning: true, ..healthy() }, T0);
        assert_eq!(s.flag, Flag::Red);
        step(&mut s, &Observation { presigning: true, ..healthy() }, T0 + DAY);
        assert_eq!(s.flag, Flag::Red);
    }

    #[test]
    fn new_proof_resets_cool_off() {
        let mut s = base();
        step(&mut s, &Observation { time_lock_secs: 0, ..healthy() }, T0);
        step(&mut s, &healthy(), T0 + DAY);
        step(&mut s, &Observation { presigning: true, ..healthy() }, T0 + 5 * DAY);
        step(&mut s, &healthy(), T0 + 9 * DAY);
        assert_eq!(s.flag, Flag::Red);
        step(&mut s, &healthy(), T0 + 9 * DAY + COOL_OFF_SECS);
        assert_eq!(s.flag, Flag::Green);
    }

    #[test]
    fn raised_threshold_becomes_baseline() {
        let mut s = base();
        step(&mut s, &Observation { threshold: 5, ..healthy() }, T0);
        assert_eq!(s.baseline_threshold, 5);
        step(&mut s, &Observation { threshold: 4, ..healthy() }, T0 + DAY);
        assert_eq!(s.flag, Flag::Red);
        assert_eq!(s.reasons, reason::THRESHOLD_DROPPED);
    }

    #[test]
    fn lowered_threshold_is_accepted_after_a_red_week() {
        let mut s = base();
        let low = Observation { threshold: 3, ..healthy() };
        step(&mut s, &low, T0);
        assert_eq!(s.flag, Flag::Red);
        step(&mut s, &low, T0 + COOL_OFF_SECS - 1);
        assert_eq!(s.flag, Flag::Red);
        assert_eq!(s.active_reasons, reason::THRESHOLD_DROPPED);
        // After a week red, the lower threshold becomes the baseline and the
        // cool-off starts.
        step(&mut s, &low, T0 + COOL_OFF_SECS);
        assert_eq!(s.baseline_threshold, 3);
        assert_eq!(s.active_reasons, 0);
        assert_eq!(s.flag, Flag::Red);
        step(&mut s, &low, T0 + 2 * COOL_OFF_SECS);
        assert_eq!(s.flag, Flag::Green);
        // A further drop is red again.
        step(&mut s, &Observation { threshold: 2, ..healthy() }, T0 + 2 * COOL_OFF_SECS + DAY);
        assert_eq!(s.flag, Flag::Red);
    }

    #[test]
    fn an_old_red_does_not_shorten_the_threshold_week() {
        let mut s = base();
        step(&mut s, &Observation { time_lock_secs: 0, ..healthy() }, T0);
        // The threshold drops eight days into an unrelated red.
        let low = Observation { threshold: 3, time_lock_secs: 0, ..healthy() };
        step(&mut s, &low, T0 + 8 * DAY);
        assert_eq!(s.baseline_threshold, 4);
        assert!(s.active_reasons & reason::THRESHOLD_DROPPED != 0);
        step(&mut s, &low, T0 + 8 * DAY + COOL_OFF_SECS);
        assert_eq!(s.baseline_threshold, 3);
    }

    #[test]
    fn other_reasons_keep_a_lowered_threshold_red() {
        let mut s = base();
        let bad = Observation { threshold: 3, time_lock_secs: 0, ..healthy() };
        step(&mut s, &bad, T0);
        step(&mut s, &bad, T0 + COOL_OFF_SECS);
        assert_eq!(s.flag, Flag::Red);
        assert_eq!(s.active_reasons, reason::TIME_LOCK_BELOW_MIN);
    }

    #[test]
    fn pending_upgrade_is_amber_and_never_red_alone() {
        let mut s = base();
        let o = Observation { upgrade_pending: true, ..healthy() };
        step(&mut s, &o, T0);
        assert_eq!(s.flag, Flag::Amber);
        assert_eq!(s.active_reasons, reason::UPGRADE_PENDING);
        step(&mut s, &o, T0 + 10 * DAY);
        assert_eq!(s.flag, Flag::Amber);
    }

    #[test]
    fn executed_upgrade_returns_green_at_once() {
        let mut s = base();
        step(&mut s, &Observation { upgrade_pending: true, ..healthy() }, T0);
        step(&mut s, &healthy(), T0 + DAY);
        assert_eq!(s.flag, Flag::Green);
        assert_eq!(s.reasons, 0);
    }

    #[test]
    fn upgrade_with_presigning_still_needs_cool_off() {
        let mut s = base();
        step(&mut s, &Observation { upgrade_pending: true, presigning: true, ..healthy() }, T0);
        step(&mut s, &healthy(), T0 + DAY);
        assert_eq!(s.flag, Flag::Amber);
        step(&mut s, &healthy(), T0 + DAY + COOL_OFF_SECS);
        assert_eq!(s.flag, Flag::Green);
    }

    #[test]
    fn red_stays_red_through_a_pending_upgrade() {
        let mut s = base();
        step(&mut s, &Observation { time_lock_secs: 0, ..healthy() }, T0);
        step(&mut s, &Observation { upgrade_pending: true, ..healthy() }, T0 + DAY);
        assert_eq!(s.flag, Flag::Red);
    }

    fn arb_obs() -> impl Strategy<Value = Observation> {
        (1u16..8, prop_oneof![Just(0u32), Just(1800), Just(3600), Just(86_400)], 0u16..3, any::<bool>(), any::<bool>(), any::<bool>())
            .prop_map(|(threshold, time_lock_secs, newly_replaced, authority_moved, presigning, upgrade_pending)| Observation {
                threshold,
                time_lock_secs,
                member_count: 8,
                newly_replaced,
                authority_moved: authority_moved && threshold % 3 == 0,
                presigning,
                upgrade_pending,
            })
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(2000))]

        /// Over any sequence of config changes: red always carries a reason,
        /// green is reached from amber/red only after a full cool-off, and the
        /// flag is never green while a condition holds.
        #[test]
        fn flag_invariants(seq in proptest::collection::vec((arb_obs(), 0i64..4 * DAY), 1..60)) {
            let mut s = base();
            let mut now = T0;
            for (o, dt) in seq {
                now += dt;
                let clear_since = if s.active_reasons == 0 { s.clear_since } else { 0 };
                let latched = s.reasons;
                let from = step(&mut s, &o, now);
                if s.flag == Flag::Red {
                    prop_assert!(s.reasons & HARD_MASK != 0);
                }
                if s.flag != Flag::Green {
                    prop_assert!(s.reasons != 0);
                }
                if s.flag == Flag::Green {
                    prop_assert_eq!(s.active_reasons, 0);
                    if from != Flag::Green && !upgrade_only(latched) {
                        prop_assert!(clear_since != 0 && now - clear_since >= COOL_OFF_SECS);
                    }
                }
                if s.flag == Flag::Amber {
                    prop_assert_eq!(s.reasons & HARD_MASK, 0);
                }
            }
        }
    }
}
