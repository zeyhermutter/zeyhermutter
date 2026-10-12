// Der Abgleich zwischen den Migrationen im Repo und denen in einer Datenbank --
// als reine Rechnung, ohne Netz.
//
// Getrennt von scripts/pruefe-migrationsstand.mjs, damit
// scripts/check-migrationsstand.mjs die Rechnung bei jedem Build pruefen kann,
// ohne eine Datenbank zu fragen. Der Guard selbst hat keinen Schalter, mit dem
// man ihm eine Liste unterschieben koennte: jede solche Hintertuer waere auch
// ein Weg, ihn zu umgehen.

import { readdir } from "node:fs/promises";
import path from "node:path";

/** "20261008014300_measurement_order_module.sql" -> "20261008014300" */
export function versionAusDatei(datei) {
  const treffer = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(datei);
  return treffer ? treffer[1] : null;
}

/** Alle Migrationen im Repo, nach Version sortiert, mit Dateiname. */
export async function repoMigrationen(wurzel) {
  const verzeichnis = path.join(wurzel, "supabase", "migrations");
  const dateien = (await readdir(verzeichnis)).filter((d) => d.endsWith(".sql")).sort();
  const migrationen = [];
  const ungueltig = [];
  for (const datei of dateien) {
    const version = versionAusDatei(datei);
    if (version) migrationen.push({ version, datei });
    else ungueltig.push(datei);
  }
  return { migrationen, ungueltig };
}

/**
 * Vergleicht in beide Richtungen.
 *
 * fehlen: im Repo, aber nicht in der Datenbank. Der Code, der ausgeliefert
 *         werden soll, verlaesst sich darauf -- die Datenbank hat es nicht.
 *
 * fremd:  in der Datenbank, aber nicht im Repo. Jemand hat die Datenbank an
 *         der Versionsverwaltung vorbei geaendert. Das naechste Projekt, das
 *         aus dem Repo aufgebaut wird, bekommt diese Aenderung nie.
 *
 * Beide Richtungen sind ein Grund anzuhalten. Die zweite ist am 12.10.2026
 * in BETA tatsaechlich aufgetreten: eine Migration war unter einer anderen
 * Versionsnummer verbucht als im Repo, eine zweite gar nicht -- beides Folge
 * eines Werkzeugs, das beim Anwenden seinen eigenen Zeitstempel vergibt.
 */
export function vergleiche(repoVersionen, zielVersionen) {
  const imRepo = new Set(repoVersionen);
  const imZiel = new Set(zielVersionen);
  return {
    fehlen: [...imRepo].filter((v) => !imZiel.has(v)).sort(),
    fremd: [...imZiel].filter((v) => !imRepo.has(v)).sort(),
  };
}
