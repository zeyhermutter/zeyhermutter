import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/kampagne-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { KAMPAGNENSTATUS, beschrifte } from "~/lib/labels";
import { tag } from "~/lib/format";
import { ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Kampagnen: links die Liste, rechts der Datensatz.
// Derselbe Aufbau wie Kontakte und Objekte (13.10.2026). "Kampagnen &
// Gebiete" selbst bleibt die Uebersicht mit Kanaelen und Gebieten -- sie
// leitet nicht in die erste Kampagne um.
// Der Seitenkopf wiederholte Name und Status -- das steht im Kopf darueber.

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "acquisition.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "acquisition_campaigns",
    spalten: "id,campaign_number,name,status,starts_on,ends_on,archived_at",
    sortierung: "updated_at",
    id: params.campaignId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh): { id: string; nummer: string; titel: string; stand: string; unter: string; kontext: string } => ({
      id: r.id, nummer: r.campaign_number, titel: r.name,
      stand: r.archived_at ? "Archiviert" : beschrifte(KAMPAGNENSTATUS, r.status),
      unter: [r.starts_on ? tag(r.starts_on) : null, r.ends_on ? tag(r.ends_on) : null].filter(Boolean).join(" – "),
      kontext: [r.starts_on ? `ab ${tag(r.starts_on)}` : null, r.ends_on ? `bis ${tag(r.ends_on)}` : null].filter(Boolean).join(" ") });
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function KampagneArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { campaignId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/acquisition/${z.id}`,
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
      listenName="Kampagnenliste"
      einzahl="Kampagne"
      mehrzahl="Kampagnen"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={campaignId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer …"
      volleListe="/acquisition#kampagnen"
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
