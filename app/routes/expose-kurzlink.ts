import type { Route } from "./+types/expose-kurzlink";

// /e/<Kennung> -- der kurze Exposé-Link aus einer E-Mail (A7, 19.10.2026).
//
// Der Empfaenger ist nicht angemeldet. Die Kennung geht an die Edge-Funktion
// expose-link (sie kennt die Dienstrolle, der Worker nicht); die antwortet mit
// einer Download-Adresse, die eine Minute gilt, und dorthin wird
// weitergeleitet. Ist der Link abgelaufen oder zurueckgezogen, steht hier eine
// kurze Seite mit dem Hinweis -- ohne Angaben zum Objekt oder zur Anfrage.

const KENNUNG = /^[A-Za-z0-9_-]{22}$/;

const SEITE = (titel: string, text: string, status: number) => new Response(
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<meta name="robots" content="noindex,nofollow"><title>${titel}</title>`
  + `<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#eef2f1;color:#1b2733}`
  + `main{max-width:520px;margin:12vh auto;padding:28px;background:#fff;border:1px solid #cdd3d9;border-radius:12px}`
  + `h1{margin:0 0 12px;font-size:22px}p{margin:0 0 12px;line-height:1.5;color:#3d4a56}a{color:#0b5cad}</style></head>`
  + `<body><main><h1>${titel}</h1><p>${text}</p><p><a href="/kontakt">Kontakt aufnehmen</a></p></main></body></html>`,
  {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  },
);

const NICHT_GUELTIG = () => SEITE(
  "Dieser Link ist nicht mehr gültig",
  "Der Link zum Exposé war zeitlich begrenzt oder wurde zurückgezogen. Gern senden wir Ihnen das Exposé erneut.",
  410,
);

export async function loader({ params, context }: Route.LoaderArgs) {
  const kennung = String(params.token ?? "");
  if (!KENNUNG.test(kennung)) return NICHT_GUELTIG();

  const env = context.cloudflare.env;
  let antwort: Response;
  try {
    antwort = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/expose-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ token: kennung }),
    });
  } catch {
    return SEITE("Das Exposé ist gerade nicht erreichbar", "Bitte versuchen Sie es in einigen Minuten erneut.", 503);
  }
  const koerper = await antwort.json().catch(() => ({})) as { ok?: boolean; url?: string };
  if (antwort.ok && koerper.ok === true && typeof koerper.url === "string") {
    // Nur zur eigenen Speicheradresse weiterleiten.
    const ziel = new URL(koerper.url);
    if (ziel.origin === new URL(env.SUPABASE_URL).origin && ziel.pathname.startsWith("/storage/v1/object/sign/")) {
      return new Response(null, { status: 302, headers: { Location: ziel.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
    }
  }
  if (antwort.status === 404 || antwort.status === 410) return NICHT_GUELTIG();
  return SEITE("Das Exposé ist gerade nicht erreichbar", "Bitte versuchen Sie es in einigen Minuten erneut.", 503);
}
