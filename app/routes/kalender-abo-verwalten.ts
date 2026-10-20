import { data, redirect } from "react-router";
import type { Route } from "./+types/kalender-abo-verwalten";
import { requireActiveUser } from "~/lib/auth.server";

// Kalender-Abo anlegen oder beenden (20.10.2026), aufgerufen aus dem Kalender.
// Die Kennung wird hier zufaellig erzeugt (256 Bit), nur einmal angezeigt und
// nur als SHA-256 gespeichert. Ein neues Abo beendet das vorige.

function base64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function loader() {
  return redirect("/crm/calendar");
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const fd = await request.formData();
  const absicht = String(fd.get("_intent") ?? "");
  if (absicht === "beenden") {
    const { error } = await supabase.rpc("kalender_abo_widerrufen");
    return data({ beendet: !error, error: error ? "Das Abo konnte nicht beendet werden." : null, link: null as string | null }, { headers: responseHeaders() });
  }
  if (absicht === "anlegen") {
    const zufall = new Uint8Array(32);
    crypto.getRandomValues(zufall);
    const kennung = base64url(zufall);
    const { error } = await supabase.rpc("kalender_abo_anlegen", { p_token_hash: await sha256(kennung) });
    if (error) return data({ beendet: false, error: "Das Abo konnte nicht angelegt werden.", link: null }, { status: 400, headers: responseHeaders() });
    const url = new URL(request.url);
    return data({ beendet: false, error: null, link: `${url.protocol}//${url.host}/kalender/${kennung}.ics` }, { headers: responseHeaders() });
  }
  return data({ beendet: false, error: "Unbekannte Aktion.", link: null }, { status: 400, headers: responseHeaders() });
}
