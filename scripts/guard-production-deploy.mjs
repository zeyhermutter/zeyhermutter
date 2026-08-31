import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.json", import.meta.url), "utf8"));
const production = config.env?.production;
const vars = production?.vars ?? {};
const required = ["APP_BASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
const placeholders = required.filter((key) => !vars[key] || String(vars[key]).includes("SET_PRODUCTION"));

if (production?.name !== "zeyhermutter-production" || vars.APP_ENV !== "production") {
  console.error("Production Worker name or APP_ENV is not configured safely.");
  process.exit(1);
}

if (placeholders.length) {
  console.error(`Production configuration still contains placeholders: ${placeholders.join(", ")}`);
  process.exit(1);
}

const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();

if (branch && branch !== "main") {
  console.error(`Production deploys are allowed only from main, not ${branch}.`);
  process.exit(1);
}

if (dirty) {
  console.error("Production deploy refused: the Git working tree is not clean.");
  process.exit(1);
}

if (process.env.DEPLOY_PRODUCTION !== "YES") {
  console.error("Production deploy refused: set DEPLOY_PRODUCTION=YES after release approval.");
  process.exit(1);
}
