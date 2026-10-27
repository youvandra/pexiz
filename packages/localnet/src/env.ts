// In-process SVM (LiteSVM) with the three programs loaded from target/deploy,
// plus writers for the accounts the oracle reads: program data, Squads
// multisigs and nonce accounts. Used by the tests and the replay harness.
import { Clock, FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  MINT_SIZE, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createInitializeMint2Instruction,
  createMintToInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BPF_LOADER_UPGRADEABLE_ID, ORACLE_PROGRAM_ID, Permission, SQUADS_V4_ID, decodeMultisig, encodeMultisig,
  encodeNonce, encodeProgramData, programDataAddress, decodeVenue, venuePda, type Multisig,
} from "@pexiz/sdk";

const ROOT = join(import.meta.dir, "../../..");
export const DAY = 86_400;
/** 23 Mar 2026 00:00 UTC, the day the first nonce accounts appeared. */
export const T0 = 1_774_224_000;

export class Env {
  svm: LiteSVM;
  payer = Keypair.generate();

  constructor() {
    this.svm = new LiteSVM();
    this.svm.addProgramFromFile(ORACLE_PROGRAM_ID, join(ROOT, "target/deploy/pexiz_oracle.so"));
    for (const [name, id] of extraPrograms()) this.svm.addProgramFromFile(id, join(ROOT, `target/deploy/${name}.so`));
    this.svm.airdrop(this.payer.publicKey, BigInt(1000 * LAMPORTS_PER_SOL));
    this.setTime(T0);
  }

  now(): number {
    return Number(this.svm.getClock().unixTimestamp);
  }

  setTime(ts: number) {
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(c.slot + 1n, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(ts)));
  }

  warp(secs: number) {
    this.setTime(this.now() + secs);
  }

  send(ixs: TransactionInstruction[], signers: Keypair[] = []): TransactionMetadata {
    const r = this.trySend(ixs, signers);
    if (r instanceof FailedTransactionMetadata) {
      throw new Error(`tx failed: ${r.err()}\n${r.meta().logs().join("\n")}`);
    }
    return r;
  }

  trySend(ixs: TransactionInstruction[], signers: Keypair[] = []): TransactionMetadata | FailedTransactionMetadata {
    const tx = new Transaction();
    tx.add(...ixs);
    tx.feePayer = this.payer.publicKey;
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.sign(this.payer, ...signers);
    const r = this.svm.sendTransaction(tx);
    this.svm.expireBlockhash();
    return r;
  }

  /** Error text and logs of a transaction expected to fail. */
  expectFail(ixs: TransactionInstruction[], signers: Keypair[] = []): string {
    const r = this.trySend(ixs, signers);
    if (!(r instanceof FailedTransactionMetadata)) throw new Error("expected the transaction to fail");
    return `${r.err()}\n${r.meta().logs().join("\n")}`;
  }

  setRaw(address: PublicKey, owner: PublicKey, data: Buffer, executable = false) {
    this.svm.setAccount(address, {
      lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(data.length))) + 1,
      data,
      owner,
      executable,
      rentEpoch: 0,
    } as any);
  }

  data(address: PublicKey): Buffer {
    const a = this.svm.getAccount(address);
    if (!a) throw new Error(`missing account ${address.toBase58()}`);
    return Buffer.from(a.data);
  }

  venue(program: PublicKey) {
    return decodeVenue(this.data(venuePda(program)));
  }

  /**
   * A watched program's program-data account. The oracle never reads the
   * program account itself, so only program data is written; that also works
   * for programs LiteSVM has loaded from a file.
   */
  setWatchedProgram(program: PublicKey, authority: PublicKey | null) {
    this.setRaw(programDataAddress(program), BPF_LOADER_UPGRADEABLE_ID, encodeProgramData(1n, authority));
  }

  setMultisig(address: PublicKey, m: Multisig) {
    this.setRaw(address, SQUADS_V4_ID, encodeMultisig(m));
  }

  multisig(address: PublicKey): Multisig {
    return decodeMultisig(this.data(address));
  }

  editMultisig(address: PublicKey, f: (m: Multisig) => void) {
    const m = this.multisig(address);
    f(m);
    this.setMultisig(address, m);
  }

  createMint(decimals = 6, authority = this.payer.publicKey): PublicKey {
    const mint = Keypair.generate();
    const lamports = Number(this.svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE)));
    this.send([
      SystemProgram.createAccount({ fromPubkey: this.payer.publicKey, newAccountPubkey: mint.publicKey, lamports, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(mint.publicKey, decimals, authority, null),
    ], [mint]);
    return mint.publicKey;
  }

  ata(owner: PublicKey, mint: PublicKey): PublicKey {
    const a = getAssociatedTokenAddressSync(mint, owner, true);
    if (!this.svm.getAccount(a)) {
      this.send([createAssociatedTokenAccountIdempotentInstruction(this.payer.publicKey, a, owner, mint)]);
    }
    return a;
  }

  mintTo(mint: PublicKey, owner: PublicKey, amount: bigint): PublicKey {
    const a = this.ata(owner, mint);
    this.send([createMintToInstruction(mint, a, this.payer.publicKey, amount)]);
    return a;
  }

  balance(tokenAccount: PublicKey): bigint {
    const a = this.svm.getAccount(tokenAccount);
    return a ? Buffer.from(a.data).readBigUInt64LE(64) : 0n;
  }

  supply(mint: PublicKey): bigint {
    return this.data(mint).readBigUInt64LE(36);
  }

  /** Close an account: no lamports, no data, owned by System. */
  closeAccount(address: PublicKey) {
    this.svm.setAccount(address, { lamports: 0, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false, rentEpoch: 0 } as any);
  }

  /** A System durable-nonce account controlled by `authority`. */
  addNonce(authority: PublicKey, state = 1): PublicKey {
    const k = Keypair.generate().publicKey;
    this.setRaw(k, SystemProgram.programId, encodeNonce(authority, state));
    return k;
  }
}

function extraPrograms(): [string, PublicKey][] {
  const out: [string, PublicKey][] = [];
  for (const name of ["pexiz_vault", "canary_venue", "pexiz_exit"]) {
    const idl = join(ROOT, `packages/sdk/idl/${name}.json`);
    if (existsSync(idl)) out.push([name, new PublicKey(JSON.parse(readFileSync(idl, "utf8")).address)]);
  }
  return out;
}

export function members(n: number) {
  return Array.from({ length: n }, () => Keypair.generate());
}

export function multisigOf(threshold: number, timeLock: number, keys: PublicKey[]): Multisig {
  return {
    createKey: Keypair.generate().publicKey,
    configAuthority: PublicKey.default,
    threshold,
    timeLock,
    transactionIndex: 0n,
    staleTransactionIndex: 0n,
    rentCollector: null,
    bump: 255,
    members: keys.map((key) => ({ key, permissions: Permission.All })),
  };
}
