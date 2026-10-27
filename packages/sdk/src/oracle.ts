import { BN, BorshCoder, EventParser, Program, utils, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, type AccountMeta, type TransactionInstruction } from "@solana/web3.js";
import oracleIdl from "../idl/pexiz_oracle.json";
import { programDataAddress, vaultPda } from "./squads";
import { flagName, type FlagName } from "./reasons";

export const ORACLE_PROGRAM_ID = new PublicKey(oracleIdl.address);
/** The one program the oracle times in minutes; see `FAST_CANARY_PROGRAM` in the oracle. */
export const FAST_CANARY_PROGRAM_ID = new PublicKey("432t9qKLgxBAZjy9LBuPSAuJBtPP52gM6ZW4o1r8fBqj");
export const oracleCoder = new BorshCoder(oracleIdl as Idl);

const offline = { connection: new Connection("http://127.0.0.1:8899") } as any;
export const oracleProgram = new Program(oracleIdl as Idl, offline);

export function venuePda(program: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("venue"), program.toBuffer()], ORACLE_PROGRAM_ID)[0];
}

export interface VenueParams {
  program: PublicKey;
  multisig: PublicKey;
  vaultIndex?: number;
  minTimeLockSecs: number;
  exitTimeSecs: number;
}

export function registerVenueIx(payer: PublicKey, p: VenueParams): Promise<TransactionInstruction> {
  const vaultIndex = p.vaultIndex ?? 0;
  return oracleProgram.methods
    .registerVenue({
      program: p.program,
      multisig: p.multisig,
      upgradeAuthority: vaultPda(p.multisig, vaultIndex)[0],
      vaultIndex,
      minTimeLockSecs: p.minTimeLockSecs,
      exitTimeSecs: p.exitTimeSecs,
    })
    .accountsStrict({
      venue: venuePda(p.program),
      programData: programDataAddress(p.program),
      multisig: p.multisig,
      payer,
      systemProgram: PublicKey.default,
    })
    .instruction();
}

/**
 * `update` with proof accounts appended as remaining accounts: pre-signing
 * accounts, and the proposal and vault transaction of each pending upgrade.
 */
export function updateIx(program: PublicKey, multisig: PublicKey, proofs: PublicKey[] = []): Promise<TransactionInstruction> {
  const remaining: AccountMeta[] = proofs.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }));
  return oracleProgram.methods
    .update()
    .accountsStrict({ venue: venuePda(program), programData: programDataAddress(program), multisig })
    .remainingAccounts(remaining)
    .instruction();
}

export interface Venue {
  address?: PublicKey;
  program: PublicKey;
  programData: PublicKey;
  multisig: PublicKey;
  upgradeAuthority: PublicKey;
  /** Squads vault index holding the upgrade authority. */
  vaultIndex: number;
  minTimeLockSecs: number;
  exitTimeSecs: number;
  threshold: number;
  timeLockSecs: number;
  members: PublicKey[];
  /** Pre-signing accounts proven live and not yet shown dead. */
  presigners: PublicKey[];
  /** Squads transaction indices of approved upgrade proposals still pending. */
  pendingUpgrades: bigint[];
  baselineThreshold: number;
  lowThresholdSince: number;
  flag: FlagName;
  reasons: number;
  activeReasons: number;
  amberSince: number;
  redSince: number;
  clearSince: number;
  lastUpdateSlot: bigint;
  /** Admin delay minus the time users need to exit. Negative: users lose the race. */
  exitWindowSecs: number;
}

const num = (x: BN | number) => (typeof x === "number" ? x : x.toNumber());

export function decodeVenue(data: Buffer, address?: PublicKey): Venue {
  const v = oracleCoder.accounts.decode("Venue", data);
  return {
    address,
    program: v.params_program,
    programData: v.program_data,
    multisig: v.multisig,
    upgradeAuthority: v.upgrade_authority,
    vaultIndex: v.vault_index,
    minTimeLockSecs: v.min_time_lock_secs,
    exitTimeSecs: v.exit_time_secs,
    threshold: v.snapshot.threshold,
    timeLockSecs: v.snapshot.time_lock_secs,
    members: v.members,
    presigners: v.presigners,
    pendingUpgrades: (v.pending_upgrades ?? []).map((x: BN) => BigInt(x.toString())),
    baselineThreshold: v.baseline_threshold,
    lowThresholdSince: num(v.low_threshold_since),
    flag: flagName(v.flag),
    reasons: v.reasons,
    activeReasons: v.active_reasons,
    amberSince: num(v.amber_since),
    redSince: num(v.red_since),
    clearSince: num(v.clear_since),
    lastUpdateSlot: BigInt(v.last_update_slot.toString()),
    exitWindowSecs: v.snapshot.time_lock_secs - v.exit_time_secs,
  };
}

export async function fetchVenues(conn: Connection): Promise<Venue[]> {
  const disc = (oracleIdl as any).accounts.find((a: any) => a.name === "Venue").discriminator as number[];
  const accs = await conn.getProgramAccounts(ORACLE_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(Buffer.from(disc)) } }],
  });
  return accs.map((a) => decodeVenue(a.account.data as Buffer, a.pubkey));
}

export interface FlagChanged {
  venue: PublicKey;
  program: PublicKey;
  from: FlagName;
  to: FlagName;
  reasons: number;
  slot: bigint;
  unixTimestamp: number;
}

export function parseFlagChanged(logs: string[]): FlagChanged[] {
  const parser = new EventParser(ORACLE_PROGRAM_ID, oracleCoder);
  const out: FlagChanged[] = [];
  for (const e of parser.parseLogs(logs)) {
    if (e.name !== "FlagChanged") continue;
    const d = e.data as any;
    out.push({
      venue: d.venue,
      program: d.program,
      from: flagName(d.from),
      to: flagName(d.to),
      reasons: d.reasons,
      slot: BigInt(d.slot.toString()),
      unixTimestamp: num(d.unix_timestamp),
    });
  }
  return out;
}
