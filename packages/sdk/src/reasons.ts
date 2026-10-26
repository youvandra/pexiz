// Oracle reason bits, mirrored from programs/pexiz-oracle/src/lib.rs.
export const Reason = {
  TIME_LOCK_BELOW_MIN: 1 << 0,
  THRESHOLD_DROPPED: 1 << 1,
  MEMBERS_REPLACED: 1 << 2,
  UPGRADE_AUTHORITY_MOVED: 1 << 3,
  SIGNER_PRESIGNING: 1 << 4,
  AMBER_ESCALATED: 1 << 5,
} as const;

const TEXT: Record<number, string> = {
  [Reason.TIME_LOCK_BELOW_MIN]: "the multisig timelock is below the minimum, so an admin change can land before users get out",
  [Reason.THRESHOLD_DROPPED]: "the multisig approval threshold was lowered",
  [Reason.MEMBERS_REPLACED]: "more than a third of the multisig members were replaced within 7 days",
  [Reason.UPGRADE_AUTHORITY_MOVED]: "the program upgrade authority moved away from the registered multisig vault",
  [Reason.SIGNER_PRESIGNING]: "a multisig member controls a durable-nonce account, so approvals can be pre-signed and landed later",
  [Reason.AMBER_ESCALATED]: "the pre-signing warning has been unresolved for 48 hours",
};

export function reasonNames(bits: number): string[] {
  return Object.entries(Reason).filter(([, b]) => bits & b).map(([n]) => n);
}

export function describeReasons(bits: number): string[] {
  return Object.values(Reason).filter((b) => bits & b).map((b) => TEXT[b]);
}

export type FlagName = "green" | "amber" | "red";

/** Anchor decodes enums as `{ green: {} }`. */
export function flagName(flag: object): FlagName {
  return Object.keys(flag)[0].toLowerCase() as FlagName;
}
