#!/usr/bin/env node
// Bewacht, was der Deploy-Workflow mit "git diff --check" prueft --
// schon vor dem Commit.
//
// WIE DAS AUFKAM
//
// Am 12.10.2026 lief der BETA-Deploy rot, Schritt "Full diff check":
// "app/lib/objektakte-navigation.ts:150: new blank line at EOF." Eine
// Leerzeile am Dateiende. Alle 30 Pruefungen, Typecheck und Build waren
// gruen -- nur der Workflow prueft Leerzeichen, und der laeuft erst nach dem
// Push. Ein roter Deploy fuer eine Leerzeile kostet einen weiteren
// Push-Durchgang und laesst BETA auf dem alten Stand.
//
// Der Workflow prueft nur HEAD^..HEAD. Werden mehrere Commits auf einmal
// geschoben, rutscht ein Fehler in einem frueheren durch -- so waren zwei
// Stylesheets mit Leerzeile am Ende in den Bestand gekommen.
//
// WAS GEPRUEFT WIRD
//
// Alle Dateien im Arbeitsverzeichnis, wie sie jetzt sind (also auch noch
// nicht Committetes), mit derselben Regel wie der Workflow: keine Leerzeichen
// am Zeilenende, keine Leerzeile am Dateiende, keine Leerzeichen vor Tabs.
//
// Ausgenommen sind die Migrationen vor Oktober 2026. Sie sind eingespielt;
// eine Migration aendert man nach dem Einspielen nicht, auch nicht fuer
// eine Leerzeile (Migrationsdisziplin, Master-Prompt).

import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let leererBaum;
try {
  leererBaum = git("hash-object", "-t", "tree", "-w", "/dev/null").trim();
} catch {
  console.error("Leerzeichen: git ist nicht verfuegbar oder dies ist kein Repository -- Pruefung nicht moeglich.");
  process.exit(1);
}

let befund = "";
try {
  git("diff", "--check", leererBaum, "--", ".",
    ":(exclude)pnpm-lock.yaml",
    ":(exclude,glob)supabase/migrations/202[0-5]*",
    ":(exclude,glob)supabase/migrations/20260[1-9]*");
} catch (e) {
  // git diff --check endet mit 2, wenn es etwas findet; die Fundstellen stehen in stdout.
  befund = String(e.stdout ?? "") || String(e.stderr ?? e.message);
}

const zeilen = befund.split("\n").filter((z) => /^\S.*:\d+: /.test(z));
if (zeilen.length > 0) {
  console.error(`\nLeerzeichen: ${zeilen.length} Befund${zeilen.length === 1 ? "" : "e"} -- der Deploy-Workflow ("Full diff check") liefe rot.\n`);
  for (const z of zeilen) console.error(`- ${z}`);
  console.error("\n  Leerzeichen am Zeilenende bzw. die Leerzeile am Dateiende entfernen.\n");
  process.exit(1);
}
if (befund && zeilen.length === 0) {
  console.error(`Leerzeichen: git diff --check meldete etwas Unerwartetes:\n${befund}`);
  process.exit(1);
}

console.log("Leerzeichen: keine Leerzeichen am Zeilenende, keine Leerzeile am Dateiende (wie \"Full diff check\" im Deploy).");
