import { spawnSync } from "node:child_process";

const [environment, command, ...args] = process.argv.slice(2);
const allowedEnvironments = new Set(["beta", "production"]);

if (!allowedEnvironments.has(environment) || !command) {
  console.error("Usage: node scripts/with-cloudflare-env.mjs <beta|production> <command> [...args]");
  process.exit(2);
}

const result = spawnSync(command, args, {
  env: { ...process.env, CLOUDFLARE_ENV: environment },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
