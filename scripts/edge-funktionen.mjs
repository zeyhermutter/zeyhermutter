// Die Edge-Funktionen dieses Projekts, an einer Stelle.
//
// Zwei Skripte lesen diese Liste: scripts/check-edge-funktionen.mjs prueft sie
// gegen das Verzeichnis und gegen supabase/config.toml, und
// scripts/deploy-edge-funktionen.mjs spielt sie aus. Eine Funktion, die hier
// nicht steht, wird nicht ausgespielt -- und die Pruefung sagt das beim Build.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * umgebungen: wohin die Funktion gehoert.
 * verifyJwt:  was in supabase/config.toml stehen MUSS.
 * imRepo:     liegt der Quellcode unter supabase/functions/<name>/?
 * zweck:      warum sie existiert -- fuer Fehlermeldungen, nicht Zierde.
 */
export const EDGE_FUNKTIONEN = [
  {
    name: "website-inquiry",
    umgebungen: ["beta", "production"],
    verifyJwt: false,
    imRepo: true,
    zweck:
      "Nimmt alle fuenf oeffentlichen Formulare an und legt mit der Dienstrolle an. "
      + "Wird mit dem veroeffentlichbaren Schluessel gerufen, nicht mit einem Benutzer-Token -- "
      + "deshalb verify_jwt = false. Steht sie auf true, antwortet jedes oeffentliche "
      + "Formular mit 401, und zwar alle gleichzeitig.",
  },
  {
    name: "generate-property-expose",
    umgebungen: ["beta", "production"],
    verifyJwt: true,
    imRepo: true,
    zweck: "Erzeugt das Expose. Wird aus dem angemeldeten CRM gerufen, also mit Benutzer-Token.",
  },
  {
    name: "seed-demo-assets",
    umgebungen: ["beta"],
    verifyJwt: true,
    imRepo: false,
    zweck:
      "Legt Demobestand an. Liegt nicht im Repo und gehoert nie nach PRODUKTION. "
      + "Sie steht hier, damit die Pruefung ihren config.toml-Eintrag nicht fuer "
      + "eine vergessene Funktion haelt.",
  },
];

export const PROJEKTE = {
  beta: "zqhcxudpfwsfuokencvy",
  production: "vtmtxaaojbqqzwxkodye",
};

/** Die Funktionen, die in diese Umgebung ausgespielt werden -- nur die mit Quellcode. */
export function auszuspielen(umgebung) {
  return EDGE_FUNKTIONEN.filter((f) => f.imRepo && f.umgebungen.includes(umgebung));
}

/** Liest die [functions.*]-Bloecke aus supabase/config.toml. */
export async function configEintraege() {
  const text = (await readFile(path.join(WURZEL, "supabase/config.toml"), "utf8")).replace(/\r\n/g, "\n");
  const eintraege = new Map();
  for (const treffer of text.matchAll(/^\[functions\.([^\]]+)\]([^[]*)/gm)) {
    const block = treffer[2];
    const jwt = /^\s*verify_jwt\s*=\s*(true|false)\s*$/m.exec(block);
    eintraege.set(treffer[1], { verifyJwt: jwt ? jwt[1] === "true" : null, block });
  }
  return { text, eintraege };
}

/** Die in config.toml eingetragenen Projekt-Kennungen je Fernziel. */
export async function configProjekte(text) {
  const gefunden = {};
  for (const treffer of text.matchAll(/^\[remotes\.([a-z]+)\]\s*\nproject_id\s*=\s*"([^"]+)"/gm)) {
    gefunden[treffer[1]] = treffer[2];
  }
  return gefunden;
}
