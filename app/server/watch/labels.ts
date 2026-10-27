import type { Assessment } from "../../src/data/assess"

/** The app's status words, without importing its React kit. */
const LABELS: Record<Assessment, string> = { green: "Safe", amber: "Watch", exposed: "No delay", red: "Get out", unrated: "Unrated" }

export const flagLabel = (a: Assessment) => LABELS[a]
