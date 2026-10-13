import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/maklerauftrag-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { MAKLERAUFTRAGART, MAKLERAUFTRAGSTATUS, beschrifte } from "~/lib/labels";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";
import { standKlasse } from "~/lib/stand-ton";

// Der Arbeitsplatz der Makleraufträge: links die Aufträge, rechts einer.
// Derselbe Aufbau wie Kontakte und Objekte (12.10.2026). Eine Seite je
// Auftrag, keine Reiter. Der Seitenkopf bleibt: er traegt die Knoepfe
// "Immobilie öffnen", "Lead öffnen" und "Archivieren".

const HOECHSTENS = 300;

type Roh = {
  id: string;
  mandate_number: string;
  mandate_type: string;
  status: string;
  term_end: string | null;
  archived_at: string | null;
  properties: { property_number: string; internal_title: string } | { property_number: string; internal_title: string }[] | null;
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "mandate.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "brokerage_mandates",
    spalten: "id,mandate_number,mandate_type,status,term_end,archived_at,properties(property_number,internal_title)",
    sortierung: "updated_at",
    id: params.mandateId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh) => {
    const o = eins(r.properties);
    return {
      id: r.id,
      nummer: r.mandate_number,
      titel: o ? `${o.property_number} · ${o.internal_title}` : "Immobilie offen",
      stand: r.archived_at ? "Archiviert" : beschrifte(MAKLERAUFTRAGSTATUS, r.status),
      art: beschrifte(MAKLERAUFTRAGART, r.mandate_type),
      bis: r.term_end,
    };
  };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function MaklerauftragArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { mandateId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/mandates/${z.id}`,
    nummer: z.nummer,
    titel: z.titel,
    suchtext: [z.nummer, z.titel, z.stand, z.art].join(" "),
    unterzeile: <>
      <span className={`status-pill ${standKlasse(z.stand)}`}>{z.stand}</span>
      <span>{z.art}</span>
      {z.bis ? <span className="arbeitsplatz-zeile-preis">bis {tag(z.bis)}</span> : null}
    </>,
  });
  return (
    <Arbeitsplatz
      listenName="Auftragsliste"
      einzahl="Auftrag"
      mehrzahl="Aufträge"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={mandateId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Nummer, Objekt, Status …"
      neu={{ pfad: "/mandates/new", beschriftung: "+ Neu" }}
      volleListe="/mandates?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${HOECHSTENS}` : null}
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className={`status-pill ${standKlasse(akte.stand)}`}>{akte.stand}</span>} titel={akte.titel}
        kontext={[akte.art, akte.bis ? `Laufzeit bis ${tag(akte.bis)}` : null].filter(Boolean).join(" · ")} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
