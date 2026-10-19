import { data, Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/website-cms";
import { Aufklapper } from "~/components/aufklapper";
import { requirePermission } from "~/lib/auth.server";
import { istEinstieg } from "~/lib/einstieg";
import { stateLabel } from "~/lib/website-stand";
import { zeitpunkt as formatDate } from "~/lib/format";
import "~/website-cms.css";
import "~/programm-liste.css";


import { ListenUeberschrift } from "~/components/listen-ueberschrift";
export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "website.read");
  const { data: pages, error } = await supabase.from("website_pages").select("id,page_key,path,label,status,candidate_version,published_version,has_unpublished_changes,updated_at,version").order("path");
  if (error) throw new Response("Website-CMS konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });
  // Ohne Parameter: gleich die erste Seite als Akte -- Liste links, Akte
  // rechts. Die Tabelle aller Seiten gibt es mit ?ansicht=tabelle.
  const erste = (pages ?? [])[0] as any;
  if (istEinstieg(request) && erste) throw redirect(`/crm/website/${String(erste.page_key).toLowerCase()}`, { headers: responseHeaders() });
  return data({ pages: pages ?? [] }, { headers: responseHeaders() });
}

export default function WebsiteCms() {
  const { pages } = useLoaderData<typeof loader>();
  const offen = pages.filter((page: any) => stateLabel(page) !== "Veröffentlicht").length;
  // Programmliste (13.10.2026): eine Zeile je Seite der Website statt einer
  // Karte je Seite -- 15 Seiten passen so auf einen Bildschirm.
  return <main className="editor-shell programm-liste"><ListenUeberschrift/>
    <div className="programm-liste-werkzeuge">
      <Aufklapper knopf="Wie die Veröffentlichung funktioniert">
        <p className="programm-erklaerung">Nur freigegebene Stände gehen live. Bearbeitungen ändern zunächst nur den internen Entwurf. Erst eine vorbereitete Version kann veröffentlicht werden, und nur mit dem Recht zum Veröffentlichen. Bereits veröffentlichte Versionen bleiben unverändert erhalten.</p>
      </Aufklapper>
      <span className="programm-liste-zaehler">{pages.length} Seiten · {offen} mit offenem Stand</span>
    </div>
    <div className="programm-tabelle-rahmen">
      {pages.length === 0 ? <p className="programm-liste-leer">Keine Seiten angelegt.</p> : <table className="programm-tabelle">
        <thead><tr><th>Pfad</th><th>Seite</th><th>Stand</th><th className="rechts">Auf der Website</th><th className="rechts">Vorschau</th><th className="rechts">Zuletzt geändert</th><th className="rechts">Website</th></tr></thead>
        <tbody>{pages.map((page: any) => {
          const pfad = `/crm/website/${page.page_key.toLowerCase()}`;
          return <tr key={page.id}>
            <td className="zahl"><Link to={pfad}>{page.path}</Link></td>
            <td><Link to={pfad}>{page.label}</Link></td>
            <td><span className={`website-state ${page.status.toLowerCase()}`}>{stateLabel(page)}</span></td>
            <td className="zahl rechts">{page.published_version ?? "—"}</td>
            <td className="zahl rechts">{page.candidate_version ?? "—"}</td>
            <td className="zahl rechts leise">{formatDate(page.updated_at)}</td>
            <td className="rechts"><Link to={page.path} target="_blank">Live ↗</Link></td>
          </tr>;
        })}</tbody>
      </table>}
    </div>
  </main>;
}
