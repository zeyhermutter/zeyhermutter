// Der Weg von einem oeffentlichen Formular ins CRM.
//
// Die Webseite schreibt nicht selbst in die Fachtabellen. Sie schickt die
// Eingabe an die Edge-Funktion website-inquiry, und die legt mit der
// Dienstrolle an, was anzulegen ist -- nach Honigtopf, Rate-Limit,
// Dublettenpruefung und Zielsteuerung.
//
// Dieser Baustein stand vorher nur in public-sales-readiness.tsx. Mit der
// Bewertungsanfrage und dem Suchauftrag waeren daraus drei fast gleiche
// Abschnitte geworden, und der naechste haette den vierten geschrieben.

export type AufnahmeErgebnis = { ok: true } | { ok: false; status: number; meldung: string };

/** Die Aufnahmewege, die in der Zielsteuerung eine Zeile haben. */
export type Aufnahmeweg = "SELLER_CHECK" | "VALUATION" | "SEARCH_PROFILE";

type Env = { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string };

export async function sendeAufnahme(env: Env, nutzlast: Record<string, unknown>): Promise<AufnahmeErgebnis> {
  const endpunkt = `${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/website-inquiry`;
  let antwort: Response;
  try {
    antwort = await fetch(endpunkt, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(nutzlast),
    });
  } catch {
    return { ok: false, status: 502, meldung: "Die Anfrage konnte gerade nicht übermittelt werden. Bitte versuchen Sie es später erneut." };
  }

  const koerper = await antwort.json().catch(() => ({})) as { ok?: boolean };
  if (antwort.ok && koerper.ok === true) return { ok: true };

  // Die Meldungen unterscheiden sich, weil die Ursachen sich unterscheiden:
  // zu schnell hintereinander ist etwas anderes als ein geschlossener Weg,
  // und beides ist etwas anderes als eine fehlerhafte Eingabe.
  if (antwort.status === 429) {
    return { ok: false, status: 429, meldung: "Zu viele Anfragen in kurzer Zeit. Bitte versuchen Sie es später erneut." };
  }
  if (antwort.status === 503) {
    return { ok: false, status: 503, meldung: "Dieses Formular nimmt derzeit keine Anfragen entgegen. Bitte schreiben Sie uns direkt." };
  }
  return { ok: false, status: 400, meldung: "Die Anfrage konnte nicht verarbeitet werden. Bitte prüfen Sie Ihre Angaben." };
}

/**
 * Nimmt dieser Aufnahmeweg gerade Anfragen entgegen?
 *
 * Wird im Loader gefragt, damit ein geschlossenes Formular das sagt, bevor
 * jemand es ausfuellt -- und nicht erst danach.
 *
 * Bei einem Lesefehler lautet die Antwort "nein". Ein Formular anzubieten,
 * dessen Empfaenger unbekannt ist, waere die schlechtere Vermutung.
 */
export async function aufnahmewegOffen(
  supabase: { rpc(name: string, args?: any, options?: any): any },
  weg: Aufnahmeweg,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("public_intake_enabled", { p_id: weg });
  if (error) return false;
  return data === true;
}

/** Ein Schluessel je Einsendung: der zweite Klick auf "Absenden" legt nichts Zweites an. */
export function einsendeSchluessel(praefix: string) {
  return `${praefix}-${crypto.randomUUID()}`;
}

export function textFeld(fd: FormData, key: string, max = 4000) {
  return String(fd.get(key) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function zahlFeld(fd: FormData, key: string) {
  const roh = textFeld(fd, key, 20).replace(/\./g, "").replace(",", ".");
  const zahl = Number(roh);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null;
}

export function epostGueltig(wert: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wert) && wert.length <= 254;
}
