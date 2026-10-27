// A full local world: USDC mint, canary pool, Squads-layout 3-of-5 multisig
// with a 24h timelock holding the canary upgrade authority, the oracle venue
// and the escape vault.
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  CANARY_PROGRAM_ID, canaryBacking, canaryPool, depositIx, exitFloor, exitIx, initPoolIx, initVaultIx, registerVenueIx, updateIx, vaultAddresses,
  vaultPda, venuePda, decodeVault, type VaultAddresses,
} from "@pexiz/sdk";
import { Env, members, multisigOf } from "./env";

export const USDC = (n: number) => BigInt(Math.round(n * 1_000_000));

export interface User {
  kp: Keypair;
  usdc: PublicKey;
  shares: PublicKey;
  lp: PublicKey;
}

export class World {
  env = new Env();
  multisig = Keypair.generate().publicKey;
  signers = members(5);
  usdcMint!: PublicKey;
  v!: VaultAddresses;
  /** Program the venue watches: the canary, or the fast canary. */
  program = CANARY_PROGRAM_ID;

  static async create(opts: { threshold?: number; timeLock?: number; members?: number; minTimeLockSecs?: number; exitTimeSecs?: number; start?: number; program?: PublicKey } = {}): Promise<World> {
    const w = new World();
    if (opts.program) w.program = opts.program;
    w.signers = members(opts.members ?? 5);
    const { env } = w;
    if (opts.start) env.setTime(opts.start);
    w.usdcMint = env.createMint(6);
    const pool = canaryPool(w.usdcMint);
    env.send([await initPoolIx(env.payer.publicKey, pool)]);
    env.setMultisig(w.multisig, multisigOf(opts.threshold ?? 3, opts.timeLock ?? 86_400, w.signers.map((k) => k.publicKey)));
    env.setWatchedProgram(w.program, vaultPda(w.multisig)[0]);
    env.send([await registerVenueIx(env.payer.publicKey, {
      program: w.program, multisig: w.multisig, minTimeLockSecs: opts.minTimeLockSecs ?? 3600, exitTimeSecs: opts.exitTimeSecs ?? 600,
    })]);
    w.v = vaultAddresses(venuePda(w.program), w.usdcMint);
    env.send([await initVaultIx(env.payer.publicKey, w.v)]);
    return w;
  }

  user(usdc: bigint): User {
    const kp = Keypair.generate();
    this.env.svm.airdrop(kp.publicKey, BigInt(LAMPORTS_PER_SOL));
    return {
      kp,
      usdc: this.env.mintTo(this.usdcMint, kp.publicKey, usdc),
      shares: this.env.ata(kp.publicKey, this.v.shareMint),
      lp: this.env.ata(kp.publicKey, this.v.pool.lpMint),
    };
  }

  async deposit(u: User, amount: bigint) {
    return this.env.send([await depositIx(this.v, u.kp.publicKey, u.usdc, u.shares, amount)], [u.kp]);
  }

  /** `exit` for `lp` (default: all the vault holds) at the program's slippage floor unless `minOut` is given. */
  exitIx(lp?: bigint, minOut?: bigint) {
    const amount = lp ?? this.env.balance(this.v.vaultLp);
    const supply = this.env.supply(this.v.pool.lpMint);
    const floor = exitFloor(amount, canaryBacking(this.env.balance(this.v.pool.usdcReserve), supply), supply);
    return exitIx(this.v, amount, minOut ?? floor);
  }

  updateIx(proofs: PublicKey[] = []) {
    return updateIx(this.program, this.multisig, proofs);
  }

  async update(proofs: PublicKey[] = []) {
    return this.env.send([await this.updateIx(proofs)]);
  }

  setTimeLock(secs: number) {
    this.env.editMultisig(this.multisig, (m) => { m.timeLock = secs; });
  }

  flag() {
    return this.env.venue(this.program).flag;
  }

  vault() {
    return decodeVault(this.env.data(this.v.vault));
  }

  holdings() {
    return { usdc: this.env.balance(this.v.vaultUsdc), lp: this.env.balance(this.v.vaultLp), supply: this.env.supply(this.v.shareMint) };
  }
}
