import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/case-study-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { CASE_STATUS, RELEASE_STATUS } from "./case-studies";
import { ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Case Studies: links die Liste, rechts der Datensatz.
// Derselbe Aufbau wie Kontakte und Objekte (13.10.2026).
// Der Seitenkopf wiederholte Nummer, Titel und Status -- das steht im Kopf darueber.

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "case_study.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "sale_case_studies",
    spalten: "id,case_study_number,title,status,release_status,archived_at",
    sortierung: "updated_at",
    id: params.caseStudyId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh): { id: string; nummer: string; titel: string; stand: string; unter: string; kontext: string } => ({
      id: r.id, nummer: r.case_study_number, titel: r.title || r.case_study_number,
      stand: r.archived_at ? "Archiviert" : (CASE_STATUS[r.status] ?? r.status),
      unter: `Freigabe: ${RELEASE_STATUS[r.release_status] ?? r.release_status}`,
      kontext: `Freigabe: ${RELEASE_STATUS[r.release_status] ?? r.release_status}` });
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function CaseStudyArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { caseStudyId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/case-studies/${z.id}`,
    nummer: z.nummer,
    titel: z.titel,
    suchtext: [z.nummer, z.titel, z.stand, z.unter].filter(Boolean).join(" "),
    unterzeile: <>
      <span className="status-pill">{z.stand}</span>
      {z.unter ? <span>{z.unter}</span> : null}
    </>,
  });
  return (
    <Arbeitsplatz
      listenName="Case-Study-Liste"
      einzahl="Case Study"
      mehrzahl="Case Studies"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={caseStudyId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Titel, Nummer …"
      neu={{ pfad: "/case-studies?ansicht=tabelle#anlegen", beschriftung: "+ Neu" }}
      volleListe="/case-studies?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className="status-pill">{akte.stand}</span>} titel={akte.titel} kontext={akte.kontext} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
