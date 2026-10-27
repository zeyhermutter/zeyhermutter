// Kennungen fuer kurze Links ohne Anmeldung (Exposé /e/, Feedback /f/).
//
// Die Kennung erzeugt der Worker zufaellig (128 Bit, 22 Zeichen base64url).
// In die Datenbank geht nur ihr SHA-256 (hex) -- wer die Tabelle liest, kann
// damit keinen Link oeffnen.

export const KENNUNG_RE = /^[A-Za-z0-9_-]{22}$/;

export async function kennungHash(kennung: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kennung));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function neueKennung(): Promise<{ kennung: string; hash: string }> {
  const roh = crypto.getRandomValues(new Uint8Array(16));
  const kennung = btoa(String.fromCharCode(...roh)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { kennung, hash: await kennungHash(kennung) };
}
