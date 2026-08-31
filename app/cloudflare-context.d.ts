import workerConfig from "../wrangler.json";

type AppEnv = typeof workerConfig.vars;

declare global {
  interface Env extends AppEnv {}
}

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: AppEnv;
      ctx: unknown;
    };
  }
}

export {};
