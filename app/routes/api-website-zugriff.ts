import { data } from "react-router";
import type { Route } from "./+types/api-website-zugriff";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { istOeffentlicherWebsitePfad } from "~/lib/website-zugriff";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") return data({ ok: false }, { status: 405, headers: { "Cache-Control": "no-store" } });

  let body: { path?: unknown; visitor?: unknown };
  try {
    body = await request.json();
  } catch {
    return data({ ok: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const path = String(body.path ?? "").trim().slice(0, 240);
  const visitor = String(body.visitor ?? "").trim();
  if (!istOeffentlicherWebsitePfad(path) || !/^[0-9a-f-]{36}$/i.test(visitor)) {
    return data({ ok: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const visitorHash = await sha256(`zm-website-session-v1|${visitor}`);
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const { data: result, error } = await supabase.functions.invoke("website-analytics", {
    body: { path, visitor_hash: visitorHash },
  });

  if (error || result?.ok !== true) {
    console.error("website access tracking failed", { path, code: error?.name ?? result?.error ?? "UNKNOWN" });
    return data({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  return data({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
