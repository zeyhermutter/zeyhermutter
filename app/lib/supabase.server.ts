import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";

type SupabaseEnv = Pick<Env, "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY">;

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function createSupabaseServerClient(request: Request, env: SupabaseEnv) {
  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders = new Headers();

  const supabase = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "");
        },
        setAll(cookiesToSet, headers) {
          pendingCookies.push(...cookiesToSet);
          for (const [key, value] of Object.entries(headers ?? {})) {
            pendingHeaders.set(key, value);
          }
        },
      },
    },
  );

  function responseHeaders() {
    const headers = new Headers(pendingHeaders);
    for (const { name, value, options } of pendingCookies) {
      headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
    }
    headers.set("Cache-Control", "private, no-store");
    return headers;
  }

  return { supabase, responseHeaders };
}
