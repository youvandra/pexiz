// Measured facts. Every number here was read from mainnet or a public API on
// the date in MEASURED_ON; the live board re-reads what it can from chain.

export const MEASURED_ON = "26 Oct 2026"

/** Time a user needs to notice and withdraw. An assumption, shown as one. */
export const ASSUMED_EXIT_SECS = 30 * 60

export type AdminKind = "squads-v4" | "squads-v3" | "governance" | "dormant"

export interface WatchedVenue {
  id: string
  name: string
  kind: string
  category: "perps" | "prediction"
  program: string
  admin: AdminKind
  /** Squads v4 multisig behind the upgrade authority, when there is one. */
  multisig?: string
  authority: string
  snapshot: { threshold?: number; members?: number; timeLockSecs?: number }
  note?: string
  /** The venue's own mark, from its website. */
  logo: string
}

export const VENUES: WatchedVenue[] = [
  {
    id: "jupiter-perps",
    category: "perps",
    logo: "/logos/jupiter.svg",
    name: "Jupiter Perps",
    kind: "Perps · JLP pool",
    program: "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu",
    admin: "squads-v4",
    multisig: "AxkJ8oH5aDu4ZRWfsujPtxdb6Vhq4gDehpoReBgrUUSm",
    authority: "5myNNmEmPm3UAnJ2ggLEpnTFb9t9Gk8369wKw6n3uAKx",
    snapshot: { threshold: 4, members: 8, timeLockSecs: 86_400 },
  },
  {
    id: "drift",
    category: "perps",
    logo: "/logos/drift.png",
    name: "Drift",
    kind: "Perps · relaunching",
    program: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    admin: "squads-v4",
    multisig: "7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM",
    authority: "8jj7zJgdr5bDndc7evM74FMGwzLPmd4u4QxNzFi1BMai",
    snapshot: { threshold: 4, members: 7, timeLockSecs: 3_600 },
  },
  {
    id: "zeta",
    category: "perps",
    logo: "/logos/zeta.png",
    name: "Zeta",
    kind: "Perps",
    program: "ZETAxsqBRek56DhiGXrn75yj2NHU3aYUnxvHXpkf3aD",
    admin: "squads-v3",
    authority: "DdGHYzBoTGJJZ4Npy1AHVuyZsfX89ShauiukqMt8sPRw",
    snapshot: {},
    note: "Squads v3 multisig, which has no timelock",
  },
  {
    id: "adrena",
    category: "perps",
    logo: "/logos/adrena.svg",
    name: "Adrena",
    kind: "Perps",
    program: "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet",
    admin: "governance",
    authority: "7VzEXYvGmLg3tdVuFuGFQdr7GP5tutTUt8EcTGHvG8Ev",
    snapshot: {},
    note: "SPL Governance; the delay is the proposal voting period",
  },
  {
    id: "phoenix",
    category: "perps",
    logo: "/logos/phoenix.png",
    name: "Phoenix",
    kind: "Order book",
    program: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
    admin: "dormant",
    authority: "8mv7G3fJq5a5ej7E14vgcSGeQKH79emjU9fVfuhyitEq",
    snapshot: {},
    note: "Authority unused since March 2024",
  },
  {
    id: "world",
    category: "prediction",
    logo: "/logos/world.png",
    name: "World",
    kind: "Prediction market · Phantom",
    program: "prediCtPZCttYMvm2W3PtxmMxLmT1dtN7riU6Cxh6tM",
    admin: "squads-v4",
    multisig: "EX8Yout2u5avwqiUXzPFBZuj5vUp7WvSZ2SKFfz5MPog",
    authority: "6YrRV52Eq3qmWYyMsq9Wn3kCTokk1xYQJgpKQTWrKj7b",
    snapshot: { threshold: 2, members: 2, timeLockSecs: 0 },
  },
  {
    id: "triad",
    category: "prediction",
    logo: "/logos/triad.png",
    name: "Triad",
    kind: "Prediction market",
    program: "TRDwq3BN4mP3m9KsuNUWSN6QDff93VKGSwE95Jbr9Ss",
    admin: "squads-v4",
    multisig: "GtWBXoh1xUzp6FK3U5DaYdjnN1yJ1yXwEFa51aavM4TF",
    authority: "6fcSf6qfwPNR9AUUNC1UWYZDy5cQ4TzTb2aaipN2zFdq",
    snapshot: { threshold: 2, members: 4, timeLockSecs: 0 },
  },
]

/** The March–April 2026 admin takeover, rebuilt from chain data. */
export const ATTACK = [
  { date: "23 Mar", day: 0, title: "Pre-signing accounts appear", body: "Durable-nonce accounts tied to two multisig signers. Their signatures never expire.", flag: "amber" as const },
  { date: "25 Mar", day: 2, title: "Warning escalates", body: "48 hours unresolved. Pexiz turns red and the vault leaves.", flag: "red" as const, pexiz: true },
  { date: "27 Mar", day: 4, title: "Timelock cut to zero", body: "The multisig removes its own delay. Any approved change now lands at once.", flag: "red" as const },
  { date: "1 Apr 16:05", day: 9, title: "Admin handed over", body: "A pre-signed transaction from weeks earlier transfers control.", flag: "red" as const },
  { date: "1 Apr 16:08", day: 9.1, title: "The exit fills", body: "Stolen JLP is redeemed through Jupiter's pool. Its SOL custody falls 99.9% in 4.5 minutes.", flag: "red" as const },
]

/** Daily JLP supply (millions), DefiLlama TVL ÷ CoinGecko price. */
export const JLP_SUPPLY = [
  ["15 Mar", 231.2], ["17 Mar", 228.9], ["19 Mar", 229.3], ["21 Mar", 228.0], ["23 Mar", 226.4],
  ["25 Mar", 222.3], ["27 Mar", 221.9], ["29 Mar", 225.6], ["31 Mar", 224.7], ["1 Apr", 224.5],
  ["2 Apr", 179.3], ["4 Apr", 178.2], ["6 Apr", 187.0], ["8 Apr", 184.8], ["10 Apr", 182.5],
  ["12 Apr", 187.4], ["14 Apr", 189.4], ["16 Apr", 193.2], ["18 Apr", 190.3], ["20 Apr", 183.6],
].map(([d, v]) => ({ d: d as string, v: v as number }))

/** Selling JLP for USDC through the aggregator. */
export const EXIT_CAPACITY = [
  { size: "$100K", sizeN: 0.1, impact: 0.12 },
  { size: "$1M", sizeN: 1, impact: 0.3 },
  { size: "$10M", sizeN: 10, impact: 0.64 },
  { size: "$20M", sizeN: 20, impact: 6.7 },
  { size: "$30M", sizeN: 30, impact: 38.8 },
]

export const HEADLINE = {
  drained: 285,
  minutes: 12,
  warningDays: 9,
  lpReaction: 0.8,
  capCapacity: 10,
}

/** Devnet deployment (see docs/devnet.md). */
export const DEVNET = {
  oracle: "68dVVoeeYPmcPrNRycHwJAsLK25tMn6yiQhHQDWp2d7n",
  vault: "3WXGqGargd6Wig3czzD45kstziZGhQdQ5HYYdNJkJGnz",
  canary: "CHpLfS2BA2knitoRmgeef2rULJy4dJ3PtBdL8R6ZTGjb",
  multisig: "CeUSyhSs2WoUMZFjm6oWkUkukyFQ9QX8njbYFBF4er1w",
  venue: "UL2XgkscGLzfwp9oZNZbtFUMmqKFLb5Mr3qc1LuZQjF",
  escapeVault: "2UAGAGpCTsoVA3nsKTnWzUhWjRvd8L1dYie367dBeYPL",
  usdcMint: "6GCS4RCvHEZbLArUF4UwNguWww1vy4Z2uTPTxSMSDrqX",
  nonce: "HxyqLL79JWJTA6KbvNkRyxtjMUCCfiKj5JAKyEV4jF3m",
}

export const explorer = (addr: string, cluster: "devnet" | "mainnet" = "mainnet", kind: "address" | "tx" = "address") =>
  `https://explorer.solana.com/${kind}/${addr}${cluster === "devnet" ? "?cluster=devnet" : ""}`

export interface VaultListing {
  id: string
  name: string
  /** What the vault holds while the flag is green. */
  holds: string
  network: "devnet" | "mainnet"
  status: "live" | "planned"
  /** Monitor entry for the venue the vault watches. */
  monitorId: string
  blurb: string
  logo?: string
}

export const VAULTS: VaultListing[] = [
  {
    id: "canary",
    name: "Canary Pool",
    holds: "Canary LP",
    network: "devnet",
    status: "live",
    monitorId: "canary",
    blurb: "A test venue under a real Squads multisig with a 24h timelock. Every flag change here is a real on-chain event.",
  },
  {
    id: "jlp",
    name: "Jupiter JLP",
    holds: "JLP",
    network: "mainnet",
    status: "planned",
    monitorId: "jupiter-perps",
    logo: "/logos/jupiter.svg",
    blurb: "Holds JLP while Jupiter Perps reads Safe. Capped at $10M, the size JLP can exit under 1% impact.",
  },
]
