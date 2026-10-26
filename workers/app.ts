import { createRequestHandler } from "react-router";
// Statisch statt `() => import(...)` (26.10.2026): Das Server-Bundle (rund
// 5 MB) wurde vorher erst bei der ersten Anfrage eines frischen Isolats
// geladen. Parsen und Auswerten kosten dabei gemessen 70-120 ms CPU (Node,
// gleicher V8) -- und zaehlten zur CPU-Zeit genau dieser Anfrage. Auf BETA
// (Workers Free, 10 ms CPU je Anfrage) brach Cloudflare sie mit Fehler 1102
// "Worker exceeded resource limits" ab, quer ueber alle Routen bis hin zu
// robots.txt; das Isolat wurde verworfen und das naechste begann von vorn.
// Statisch importiert laeuft das Laden beim Start des Isolats und faellt unter
// das eigene Startbudget statt unter das der Anfrage.
import * as build from "virtual:react-router/server-build";

const requestHandler = createRequestHandler(build, import.meta.env.MODE);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
