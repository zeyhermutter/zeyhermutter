import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/besichtigung-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { BESICHTIGUNGSSTATUS, beschrifte } from "~/lib/labels";
import { zeitpunktKurz } from "~/lib/format";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Besichtigungen: links die Liste, rechts der Datensatz.
// Derselbe Aufbau wie Kontakte und Objekte (13.10.2026).
// Der Seitenkopf wiederholte Nummer, Objekt, Interessent, Termin und Status -- das steht im Kopf darueber.

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "viewing.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "viewings",
    spalten: "id,viewing_number,status,starts_at,meeting_point,archived_at,contacts(first_name,last_name),properties(property_number)",
    sortierung: "starts_at",
    id: params.viewingId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh): { id: string; nummer: string; titel: string; stand: string; unter: string; kontext: string } => { const k = eins(r.contacts); const o = eins(r.properties); return {
      id: r.id, nummer: r.viewing_number, titel: [o?.property_number, k ? `${k.last_name}, ${k.first_name}` : null].filter(Boolean).join(" · ") || r.viewing_number,
      stand: r.archived_at ? "Archiviert" : beschrifte(BESICHTIGUNGSSTATUS, r.status),
      unter: r.starts_at ? zeitpunktKurz(r.starts_at) : "Termin offen",
      kontext: [r.starts_at ? zeitpunktKurz(r.starts_at) : "Termin offen", r.meeting_point].filter(Boolean).join(" · ") }; };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function BesichtigungArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { viewingId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/viewings/${z.id}`,
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
      listenName="Besichtigungsliste"
      einzahl="Besichtigung"
      mehrzahl="Besichtigungen"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={viewingId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer, Objekt …"
      neu={{ pfad: "/viewings/new", beschriftung: "+ Neu" }}
      volleListe="/viewings?ansicht=tabelle"
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
