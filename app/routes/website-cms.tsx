import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/website-cms";
import { Aufklapper } from "~/components/aufklapper";
import { requirePermission } from "~/lib/auth.server";
import { zeitpunkt as formatDate } from "~/lib/format";
import "~/website-cms.css";
import "~/programm-liste.css";

function stateLabel(page: any) { if (page.status === "PUBLISHED" && !page.has_unpublished_changes) return "Veröffentlicht"; if (page.status === "READY") return "Version zur Freigabe bereit"; if (page.published_version) return "Veröffentlicht · Änderungen offen"; return "Entwurf"; }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "website.read");
  const { data: pages, error } = await supabase.from("website_pages").select("id,page_key,path,label,status,candidate_version,published_version,has_unpublished_changes,updated_at,version").order("path");
  if (error) throw new Response("Website-CMS konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });
  return data({ pages: pages ?? [] }, { headers: responseHeaders() });
}

export default function WebsiteCms() {
  const { pages } = useLoaderData<typeof loader>();
  const offen = pages.filter((page: any) => stateLabel(page) !== "Veröffentlicht").length;
  // Programmliste (13.10.2026): eine Zeile je Seite der Website statt einer
  // Karte je Seite -- 15 Seiten passen so auf einen Bildschirm.
  return <main className="editor-shell programm-liste">
    <div className="programm-liste-werkzeuge">
      <Aufklapper knopf="Wie die Veröffentlichung funktioniert">
        <p className="programm-erklaerung">Nur freigegebene Stände gehen live. Bearbeitungen ändern zunächst nur den internen Entwurf. Erst eine vorbereitete Version kann mit der Berechtigung <code>website.publish</code> veröffentlicht werden. Bereits veröffentlichte Versionen bleiben unverändert erhalten.</p>
      </Aufklapper>
      <span className="programm-liste-zaehler">{pages.length} Seiten · {offen} mit offenem Stand</span>
    </div>
    <div className="programm-tabelle-rahmen">
      {pages.length === 0 ? <p className="programm-liste-leer">Keine Seiten angelegt.</p> : <table className="programm-tabelle">
        <thead><tr><th>Pfad</th><th>Seite</th><th>Stand</th><th className="rechts">Live-Version</th><th className="rechts">Kandidat</th><th className="rechts">Zuletzt geändert</th><th className="rechts">Website</th></tr></thead>
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
