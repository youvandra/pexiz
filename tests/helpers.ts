// Test fixtures on top of @pexiz/localnet.
import { PublicKey } from "@solana/web3.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeMultisig, vaultPda, type Multisig } from "@pexiz/sdk";
import { Env, members, multisigOf } from "@pexiz/localnet";

export * from "@pexiz/localnet";

const ROOT = join(import.meta.dir, "..");

/**
 * Venue fixtures. Parameters are the mainnet values measured on 26 Oct 2026
 * (PLAN §2). If `tests/fixtures/<name>.json` exists (written by
 * scripts/measure/fixtures.py from mainnet) the real account bytes are used;
 * otherwise the multisig is synthetic, with generated member keys.
 */
export const VENUES = {
  jupiter: {
    program: new PublicKey("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"),
    multisig: new PublicKey("AxkJ8oH5aDu4ZRWfsujPtxdb6Vhq4gDehpoReBgrUUSm"),
    threshold: 4, members: 8, timeLock: 86_400,
  },
  drift: {
    program: new PublicKey("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"),
    multisig: new PublicKey("7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM"),
    threshold: 4, members: 7, timeLock: 3600,
  },
} as const;

export interface Fixture {
  program: PublicKey;
  multisig: PublicKey;
  authority: PublicKey;
  memberKeys: PublicKey[];
  real: boolean;
}

export function loadVenueFixture(env: Env, name: keyof typeof VENUES): Fixture {
  const v = VENUES[name];
  const file = join(ROOT, `tests/fixtures/${name}.json`);
  let m: Multisig;
  let real = false;
  let vaultIndex = 0;
  if (existsSync(file)) {
    const j = JSON.parse(readFileSync(file, "utf8"));
    m = decodeMultisig(Buffer.from(j.multisig.data, "base64"));
    vaultIndex = j.vaultIndex;
    real = true;
  } else {
    m = multisigOf(v.threshold, v.timeLock, members(v.members).map((k) => k.publicKey));
  }
  env.setMultisig(v.multisig, m);
  const authority = vaultPda(v.multisig, vaultIndex)[0];
  env.setWatchedProgram(v.program, authority);
  return { program: v.program, multisig: v.multisig, authority, memberKeys: m.members.map((x) => x.key), real };
}
