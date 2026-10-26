// Deploys the three programs to devnet with the program keypairs in keys/.
// Run `anchor build` first. Records each deploy signature.
import { join } from "node:path";
import { KEYS, ROOT, record, rpcUrl } from "./common";

const keypair = process.env.PEXIZ_KEYPAIR ?? "~/.config/solana/id.json";
for (const name of ["pexiz_oracle", "pexiz_vault", "canary_venue"]) {
  const p = Bun.spawnSync([
    "solana", "program", "deploy", "--url", rpcUrl, "--keypair", keypair.replace(/^~/, process.env.HOME ?? ""),
    "--program-id", join(KEYS, `${name}-keypair.json`), join(ROOT, `target/deploy/${name}.so`), "--output", "json",
  ]);
  const out = p.stdout.toString();
  if (p.exitCode !== 0) throw new Error(`${name} deploy failed:\n${out}\n${p.stderr.toString()}`);
  const j = JSON.parse(out);
  console.log(`${name} -> ${j.programId}`);
  if (j.signature) record(`deploy ${name}`, j.signature);
}
