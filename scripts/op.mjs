/**
 * op.mjs — lanza la CLI de 1Password con la service account del llavero, para
 * no pedir la huella en cada comando. Sirve para lo que lee process.env a pelo
 * (node --env-file, vercel…):
 *
 *   npm run op -- run --env-file=.env.local -- node scripts/upload-to-blob.mjs
 *
 * Ver .claude/skills/1password/SKILL.md.
 */
import { spawnSync } from "node:child_process";
import { entornoOp } from "./lib/env.mjs";

const r = spawnSync("op", process.argv.slice(2), { stdio: "inherit", env: entornoOp() });
if (r.error?.code === "ENOENT") console.error("No encuentro el comando `op`: instala 1Password CLI (winget install AgileBits.1Password.CLI) o reinicia el terminal.");
process.exit(r.status ?? 1);
