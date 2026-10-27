import type { Route } from "./+types/besichtigung-feedback";
import { KENNUNG_RE, kennungHash } from "~/lib/kurzkennung.server";
import { ABSAGEGRUND, INTERESSE_KUNDE, PREISEINSCHAETZUNG, wunschListe } from "~/lib/besichtigung-feedback";
import { IMMOBILIENARTEN } from "~/lib/public-intake";
import { tagLang } from "~/lib/format";

// /f/<Kennung> -- Rueckmeldung nach einer Besichtigung (27.10.2026).
//
// Der Makler erzeugt den Link in der Besichtigungsakte und verschickt ihn
// selbst (E-Mail, WhatsApp). Der Interessent ist nicht angemeldet. Die Seite
// ist schlichtes HTML ohne Skript: ein Formular, ein Absenden, eine
// Dankeseite. Die Datenbank-Funktionen besichtigung_feedback_formular und
// _abgeben pruefen Kennung, Ablauf, Rueckzug und ob schon geantwortet wurde;
// sie geben nur heraus, was der Interessent ohnehin kennt (Objektart, Ort,
// Datum der Besichtigung) -- keine Namen, keine Adresse.

const ART = new Map(IMMOBILIENARTEN);

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const KOPF = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const STIL = `body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#eef2f1;color:#1b2733}`
  + `main{max-width:620px;margin:6vh auto;padding:28px;background:#fff;border:1px solid #cdd3d9;border-radius:12px}`
  + `h1{margin:0 0 8px;font-size:22px}p{margin:0 0 12px;line-height:1.5;color:#3d4a56}a{color:#0b5cad}`
  + `fieldset{border:0;margin:0 0 18px;padding:0}legend{font-weight:600;margin:0 0 8px;padding:0}`
  + `label.wahl{display:flex;gap:8px;align-items:center;padding:6px 0}`
  + `textarea{width:100%;box-sizing:border-box;min-height:80px;padding:8px;border:1px solid #c3cad1;border-radius:8px;font:inherit}`
  + `textarea:focus{outline:2px solid #0b5cad;outline-offset:1px}`
  + `button{background:#062037;color:#fff;border:0;border-radius:8px;padding:11px 18px;font:inherit;font-weight:600;cursor:pointer}`
  + `small{color:#6b7782}.objekt{color:#4a5763;margin-bottom:20px}@media(max-width:640px){main{margin:0;border-radius:0;border:0}}`;

function seite(titel: string, inhalt: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="robots" content="noindex,nofollow"><title>${esc(titel)}</title><style>${STIL}</style></head>`
    + `<body><main>${inhalt}</main></body></html>`,
    { status, headers: KOPF },
  );
}

const hinweis = (titel: string, text: string, status: number) => seite(titel, `<h1>${esc(titel)}</h1><p>${esc(text)}</p><p><a href="/kontakt">Kontakt aufnehmen</a></p>`, status);

const NICHT_GUELTIG = () => hinweis("Dieser Link ist nicht mehr gültig", "Der Link zur Rückmeldung war zeitlich begrenzt oder wurde zurückgezogen.", 410);
const SCHON_DA = () => hinweis("Vielen Dank", "Ihre Rückmeldung zur Besichtigung liegt uns bereits vor.", 200);
const NICHT_ERREICHBAR = () => hinweis("Gerade nicht erreichbar", "Bitte versuchen Sie es in einigen Minuten erneut.", 503);

async function rpc(env: Env, funktion: string, koerper: Record<string, unknown>) {
  const antwort = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${funktion}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(koerper),
  });
  if (!antwort.ok) throw new Error(`RPC ${funktion} ${antwort.status}`);
  return antwort.json() as Promise<unknown>;
}

const auswahl = (name: string, liste: [string, string][], pflicht = false) => liste.map(([wert, text], i) =>
  `<label class="wahl"><input type="radio" name="${name}" value="${esc(wert)}"${pflicht && i === 0 ? " required" : ""}> ${esc(text)}</label>`).join("");

function objektzeile(d: Record<string, unknown>) {
  const teile = [
    ART.get(String(d.objektart ?? "")) ?? null,
    d.zimmer ? `${String(d.zimmer).replace(".", ",")} Zimmer` : null,
    d.flaeche ? `${Math.round(Number(d.flaeche))} m²` : null,
    d.ort ? String(d.ort) : null,
  ].filter(Boolean);
  const datum = d.termin ? tagLang(String(d.termin)) : null;
  return [teile.join(" · "), datum ? `Besichtigung am ${datum}` : null].filter(Boolean).join("<br>");
}

function formular(d: Record<string, unknown>) {
  const firma = d.firma ? String(d.firma) : "uns";
  return seite("Ihre Rückmeldung zur Besichtigung", `<h1>Wie hat Ihnen die Immobilie gefallen?</h1>`
    + `<p class="objekt">${objektzeile(d)}</p>`
    + `<form method="post">`
    + `<fieldset><legend>Ihr Eindruck insgesamt *</legend>${auswahl("interesse", INTERESSE_KUNDE, true)}</fieldset>`
    + `<fieldset><legend><label for="gefallen">Was hat Ihnen gefallen?</label></legend><textarea id="gefallen" name="gefallen" maxlength="2000"></textarea></fieldset>`
    + `<fieldset><legend><label for="bedenken">Was hat Sie gestört oder ist noch offen?</label></legend><textarea id="bedenken" name="bedenken" maxlength="2000"></textarea></fieldset>`
    + `<fieldset><legend>Wie finden Sie den Preis?</legend>${auswahl("preis", PREISEINSCHAETZUNG.map(([k, t]) => [k, t[0].toUpperCase() + t.slice(1)]))}</fieldset>`
    + `<fieldset><legend>Wie möchten Sie weitermachen?</legend>${auswahl("wunsch", wunschListe(d.vermarktung as string))}</fieldset>`
    + `<fieldset><legend>Falls die Immobilie nicht passt: Was war der Hauptgrund?</legend>${auswahl("grund", ABSAGEGRUND)}</fieldset>`
    + `<fieldset><legend><label for="anmerkung">Möchten Sie uns noch etwas mitteilen?</label></legend><textarea id="anmerkung" name="anmerkung" maxlength="2000"></textarea></fieldset>`
    + `<p><small>Ihre Rückmeldung geht an ${esc(firma)}. Wir können sie ohne Ihren Namen an den Eigentümer weitergeben. `
    + `Mehr dazu in unserer <a href="/datenschutz">Datenschutzerklärung</a>.</small></p>`
    + `<button type="submit">Rückmeldung senden</button></form>`);
}

async function hashAus(params: Route.LoaderArgs["params"]) {
  const kennung = String(params.token ?? "");
  return KENNUNG_RE.test(kennung) ? kennungHash(kennung) : null;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const hash = await hashAus(params);
  if (!hash) return NICHT_GUELTIG();
  let d: Record<string, unknown>;
  try {
    d = await rpc(context.cloudflare.env, "besichtigung_feedback_formular", { p_token_hash: hash }) as Record<string, unknown>;
  } catch {
    return NICHT_ERREICHBAR();
  }
  if (d?.zustand === "offen") return formular(d);
  if (d?.zustand === "beantwortet") return SCHON_DA();
  return NICHT_GUELTIG();
}

export async function action({ params, context, request }: Route.ActionArgs) {
  const hash = await hashAus(params);
  if (!hash) return NICHT_GUELTIG();
  const fd = await request.formData();
  const wert = (n: string) => String(fd.get(n) ?? "").slice(0, 2000);
  let ergebnis: unknown;
  try {
    ergebnis = await rpc(context.cloudflare.env, "besichtigung_feedback_abgeben", {
      p_token_hash: hash,
      p_antwort: {
        interesse: wert("interesse"), preis: wert("preis"), wunsch: wert("wunsch"), grund: wert("grund"),
        gefallen: wert("gefallen"), bedenken: wert("bedenken"), anmerkung: wert("anmerkung"),
      },
    });
  } catch {
    return NICHT_ERREICHBAR();
  }
  if (ergebnis === "ok") return hinweis("Vielen Dank für Ihre Rückmeldung", "Wir melden uns bei Ihnen, falls Fragen offen sind.", 200);
  if (ergebnis === "ungueltig") return hinweis("Bitte noch einmal", "Bitte wählen Sie mindestens Ihren Eindruck insgesamt aus. Gehen Sie dazu im Browser einen Schritt zurück.", 400);
  if (ergebnis === "beantwortet") return SCHON_DA();
  return NICHT_GUELTIG();
}
