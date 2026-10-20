import { execSync } from "node:child_process";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

function getBuildCommit() {
  try {
    return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ?? "lokal";
  }
}

const buildCommit = getBuildCommit();

// Stand-Plakette (20.10.2026, Wunsch Sebastian): neben dem Commit auch, wann
// gebaut wurde und was der Commit war -- zum Nachvollziehen, was wann live ging.
function getBuildSubject() {
  try {
    return execSync("git log -1 --format=%s", { encoding: "utf8" }).trim().slice(0, 140);
  } catch {
    return "";
  }
}
const buildSubject = getBuildSubject();
const buildTime = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })
  .format(new Date()).replace(",", "");
const cloudflareEnvironment = process.env.CLOUDFLARE_ENV ?? "beta";

if (!new Set(["beta", "production"]).has(cloudflareEnvironment)) {
  throw new Error(`Unsupported CLOUDFLARE_ENV: ${cloudflareEnvironment}`);
}

const appEnvironmentLabel = cloudflareEnvironment === "production" ? "PROD" : "BETA";

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_SUBJECT__: JSON.stringify(buildSubject),
    __APP_ENV__: JSON.stringify(cloudflareEnvironment),
    __APP_ENV_LABEL__: JSON.stringify(appEnvironmentLabel),
  },
  resolve: {
    alias: {
      "~": new URL("./app", import.meta.url).pathname,
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
  ],
});
