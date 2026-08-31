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
const cloudflareEnvironment = process.env.CLOUDFLARE_ENV ?? "beta";

if (!new Set(["beta", "production"]).has(cloudflareEnvironment)) {
  throw new Error(`Unsupported CLOUDFLARE_ENV: ${cloudflareEnvironment}`);
}

const appEnvironmentLabel = cloudflareEnvironment === "production" ? "PROD" : "BETA";

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
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
