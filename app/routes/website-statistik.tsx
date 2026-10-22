import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/website-statistik";
import { requirePermission } from "~/lib/auth.server";
import { tagKurz, uhrzeit, zeitpunkt } from "~/lib/format";
import "~/programm-liste.css";
import "~/website-statistik.css";

type Zugriff = {
  id: string;
  occurred_at: string;
  entity_reference: string | null;
  request_id: string | null;
};

const ERLAUBTE_TAGE = new Set([7, 30, 90]);
function tagSchluessel(value: string) {
  const angezeigt = tagKurz(value, "");
  const [day, month, year] = angezeigt.split(".");
  return day && month && year ? `${year}-${month}-${day}` : "";
}
function stunde(value: string) {
  const hour = Number(uhrzeit(value, "").split(":")[0]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0;
}
function verschiebeTag(key: string, delta: number) {
  const [year, month, day] = key.split("-").map(Number);
  return tagSchluessel(new Date(Date.UTC(year, month - 1, day + delta, 12)).toISOString());
}
function seitenname(path: string) {
  if (path === "/") return "Startseite";
  if (path.startsWith("/immobilien/")) return "Immobilien-Detail";
  if (path === "/immobilien") return "Immobilien";
  if (path.startsWith("/ratgeber/")) return "Ratgeber-Artikel";
  const namen: Record<string, string> = {
    "/ratgeber": "Ratgeber", "/ueber-uns": "Über uns", "/ohne-makler-verkaufen": "Ohne Makler verkaufen",
    "/bewertung": "Bewertung", "/suchauftrag": "Suchauftrag", "/technisches-aufmass": "Technisches Aufmaß",
    "/referenzen": "Referenzen", "/kontakt": "Kontakt", "/impressum": "Impressum", "/datenschutz": "Datenschutz",
    "/widerruf": "Widerruf", "/verkaufsfertig-check": "Verkaufsstrategie-Check",
  };
  return namen[path] ?? path;
}

async function ladeZugriffe(supabase: any, seit: string) {
  const rows: Zugriff[] = [];
  const BLOCK = 1000;
  const MAX = 20000;
  for (let from = 0; from < MAX; from += BLOCK) {
    const { data: part, error } = await supabase
      .from("audit_events")
      .select("id,occurred_at,entity_reference,request_id")
      .eq("entity_type", "WEBSITE_ACCESS")
      .gte("occurred_at", seit)
      .order("occurred_at", { ascending: false })
      .range(from, from + BLOCK - 1);
    if (error) throw error;
    rows.push(...((part ?? []) as Zugriff[]));
    if ((part ?? []).length < BLOCK) break;
  }
  return rows;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "audit.read");
  const url = new URL(request.url);
  const angefordert = Number(url.searchParams.get("tage") ?? "30");
  const tage = ERLAUBTE_TAGE.has(angefordert) ? angefordert : 30;
  const seit = new Date(Date.now() - tage * 86_400_000).toISOString();

  const [{ count, error: countError }, zugriffe] = await Promise.all([
    supabase.from("audit_events").select("id", { count: "exact", head: true }).eq("entity_type", "WEBSITE_ACCESS").gte("occurred_at", seit),
    ladeZugriffe(supabase, seit),
  ]);
  if (countError) throw new Response("Website-Statistik konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });

  const heute = tagSchluessel(new Date().toISOString());
  const tageMap = new Map<string, { views: number; sessions: Set<string> }>();
  for (let offset = tage - 1; offset >= 0; offset--) tageMap.set(verschiebeTag(heute, -offset), { views: 0, sessions: new Set() });
  const seitenMap = new Map<string, { views: number; sessions: Set<string> }>();
  const stunden = Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0 }));
  const sessions = new Set<string>();

  for (const row of zugriffe) {
    const session = row.request_id ?? "ohne-kennung";
    sessions.add(session);
    const day = tagSchluessel(row.occurred_at);
    const daily = tageMap.get(day);
    if (daily) { daily.views += 1; daily.sessions.add(session); }
    const path = row.entity_reference ?? "/";
    const page = seitenMap.get(path) ?? { views: 0, sessions: new Set<string>() };
    page.views += 1; page.sessions.add(session); seitenMap.set(path, page);
    stunden[stunde(row.occurred_at)].views += 1;
  }

  const tageDaten = [...tageMap.entries()].map(([date, value]) => ({ date, views: value.views, sessions: value.sessions.size }));
  const seiten = [...seitenMap.entries()].map(([path, value]) => ({ path, label: seitenname(path), views: value.views, sessions: value.sessions.size })).sort((a, b) => b.views - a.views || a.path.localeCompare(b.path)).slice(0, 30);
  const heuteDaten = tageMap.get(heute) ?? { views: 0, sessions: new Set<string>() };
  const total = count ?? zugriffe.length;
  const abgeschnitten = total > zugriffe.length;
  const letzte = zugriffe.slice(0, 100).map((row) => ({
    ...row,
    path: row.entity_reference ?? "/",
    visitor: row.request_id ? row.request_id.slice(0, 8) : "—",
  }));

  return data({
    tage, total, sessions: sessions.size, heuteViews: heuteDaten.views, heuteSessions: heuteDaten.sessions.size,
    tageDaten, seiten, stunden, letzte, abgeschnitten,
  }, { headers: responseHeaders() });
}

export default function WebsiteStatistik() {
  const { tage, total, sessions, heuteViews, heuteSessions, tageDaten, seiten, stunden, letzte, abgeschnitten } = useLoaderData<typeof loader>();
  const maxTag = Math.max(1, ...tageDaten.map((item) => item.views));
  const maxStunde = Math.max(1, ...stunden.map((item) => item.views));

  return <main className="editor-shell website-statistik">
    <header className="editor-header"><div>
      <Link className="back-link" to="/crm/website">← Website-Seiten</Link>
      <p className="eyebrow">Interne Auswertung · nicht in der Navigation verlinkt</p>
      <h1 className="editor-title">Website-Zugriffe</h1>
      <p className="editor-meta">Anonyme Browsersitzungen, ohne IP-Adresse, Browser-Fingerprinting, Referrer oder Suchparameter.</p>
    </div><Form method="get" className="website-statistik-filter"><label><span>Zeitraum</span><select name="tage" defaultValue={tage}>{[7,30,90].map((value)=><option value={value} key={value}>{value} Tage</option>)}</select></label><button className="secondary-button" type="submit">Anzeigen</button></Form></header>

    <section className="website-statistik-kpis">
      <article className="data-card"><span>Heute</span><strong>{heuteSessions}</strong><small>anonyme Besuche · {heuteViews} Seitenaufrufe</small></article>
      <article className="data-card"><span>{tage} Tage</span><strong>{sessions}</strong><small>anonyme Besuche · {total} Seitenaufrufe</small></article>
      <article className="data-card"><span>Seiten pro Besuch</span><strong>{sessions ? (total / sessions).toFixed(1).replace(".", ",") : "0,0"}</strong><small>im gewählten Zeitraum</small></article>
      <article className="data-card"><span>Letzter Zugriff</span><strong>{letzte[0] ? zeitpunkt(letzte[0].occurred_at) : "—"}</strong><small>{letzte[0]?.path ?? "Noch keine Zugriffe erfasst"}</small></article>
    </section>

    {abgeschnitten ? <div className="form-warning">Für die Detailauswertung wurden die jüngsten 20.000 Aufrufe berücksichtigt; die Gesamtzahl oben bleibt exakt.</div> : null}

    <div className="website-statistik-grid">
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Wann</p><h2>Aufrufe nach Tag</h2></div></div>
        <div className="website-statistik-balkenliste">{tageDaten.map((item)=><div className="website-statistik-balkenzeile" key={item.date}><span>{tagKurz(item.date)}</span><div className="website-statistik-balken"><i style={{width:`${Math.max(2, item.views / maxTag * 100)}%`}}/></div><strong>{item.views}</strong><small>{item.sessions} Besuche</small></div>)}</div>
      </section>
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Tageszeit</p><h2>Aufrufe nach Uhrzeit</h2></div></div>
        <div className="website-statistik-stunden">{stunden.map((item)=><div key={item.hour} title={`${String(item.hour).padStart(2,"0")}:00 · ${item.views} Aufrufe`}><i style={{height:`${Math.max(2, item.views / maxStunde * 100)}%`}}/><span>{item.hour % 3 === 0 ? String(item.hour).padStart(2,"0") : ""}</span></div>)}</div>
      </section>
    </div>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Was wird angesehen</p><h2>Seiten</h2></div><span className="subtle">{seiten.length} Pfade</span></div>
      <div className="programm-tabelle-rahmen">{seiten.length===0?<p className="programm-liste-leer">Noch keine Zugriffe erfasst.</p>:<table className="programm-tabelle"><thead><tr><th>Seite</th><th>Pfad</th><th className="rechts">Besuche</th><th className="rechts">Aufrufe</th></tr></thead><tbody>{seiten.map((item)=><tr key={item.path}><td>{item.label}</td><td className="zahl">{item.path}</td><td className="zahl rechts">{item.sessions}</td><td className="zahl rechts">{item.views}</td></tr>)}</tbody></table>}</div>
    </section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Zuletzt</p><h2>Letzte Zugriffe</h2></div><span className="subtle">max. 100</span></div>
      <div className="programm-tabelle-rahmen">{letzte.length===0?<p className="programm-liste-leer">Noch keine Zugriffe erfasst.</p>:<table className="programm-tabelle"><thead><tr><th>Zeitpunkt</th><th>Seite</th><th>anonymer Besuch</th></tr></thead><tbody>{letzte.map((item)=><tr key={item.id}><td className="zahl">{zeitpunkt(item.occurred_at)}</td><td>{item.path}</td><td className="zahl leise">{item.visitor}</td></tr>)}</tbody></table>}</div>
    </section>
  </main>;
}
