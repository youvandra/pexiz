import { expect, test } from "bun:test";
import { runReplay } from "../services/replay/src/replay";

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

test("replay: amber on 23 Mar, red by escalation on 25 Mar with the exit, timelock reason on 27 Mar", async () => {
  const r = await runReplay();
  const at = (d: string) => r.rows.find((x) => day(x.when) === d)!;
  expect(at("2026-03-22").flag).toBe("green");
  expect(at("2026-03-23").flag).toBe("green → amber");
  expect(at("2026-03-24").flag).toBe("amber");
  expect(at("2026-03-25").flag).toBe("amber → red");
  expect(at("2026-03-25").action).toBe("update+exit");
  expect(at("2026-03-25").reasons).toContain("AMBER_ESCALATED");
  expect(at("2026-03-27").reasons).toContain("TIME_LOCK_BELOW_MIN");
  expect(day(r.exitAt!)).toBe("2026-03-25");
  expect(r.rows.at(-1)!.vault).toBe("exited (USDC)");
});

test("replay without proofs: the timelock rule alone exits on 27 Mar", async () => {
  const r = await runReplay({ presigning: false });
  expect(day(r.exitAt!)).toBe("2026-03-27");
  expect(r.exitReasons).toEqual(["TIME_LOCK_BELOW_MIN"]);
});
