// Replays the March–April 2026 admin-takeover sequence: a Squads multisig with
// the drained venue's parameters, nonce accounts tied to members on 23 Mar,
// the timelock cut on 27 Mar, the handover on 1 Apr. Shows the oracle flag
// and the vault exit at each step. Needs `anchor build` first.
import { formatReplay, runReplay } from "./replay";

console.log(formatReplay(await runReplay(), await runReplay({ presigning: false })));
