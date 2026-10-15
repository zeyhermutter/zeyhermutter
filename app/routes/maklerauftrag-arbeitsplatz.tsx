import { data, Link, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/maklerauftrag-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { MAKLERAUFTRAGART, MAKLERAUFTRAGSTATUS, beschrifte } from "~/lib/labels";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";
import { standKlasse } from "~/lib/stand-ton";

// Der Arbeitsplatz der Makleraufträge: links die Aufträge, rechts einer.
// Derselbe Aufbau wie Kontakte und Objekte (12.10.2026). Eine Seite je
// Auftrag, keine Reiter. Der Seitenkopf der Unterseite wiederholte Nummer,
// Objekt und Status ein zweites Mal (P1, 15.10.2026) -- er ist weg. "Immobilie
// öffnen" und "Lead öffnen" stehen jetzt im Kopf hier, "Archivieren" unten in
// der Akte wie beim Abschluss.

const HOECHSTENS = 300;

type Roh = {
  id: string;
  mandate_number: string;
  mandate_type: string;
  status: string;
  term_end: string | null;
  archived_at: string | null;
  property_id: string | null;
  lead_id: string | null;
  properties: { property_number: string; internal_title: string } | { property_number: string; internal_title: string }[] | null;
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "mandate.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "brokerage_mandates",
    spalten: "id,mandate_number,mandate_type,status,term_end,archived_at,property_id,lead_id,properties(property_number,internal_title)",
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
      objektId: r.property_id,
      leadId: r.lead_id,
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
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className={`status-pill ${standKlasse(akte.stand)}`}>{akte.stand}</span>} titel={akte.titel}
        kontext={[akte.art, akte.bis ? `Laufzeit bis ${tag(akte.bis)}` : null].filter(Boolean).join(" · ")}
        aktionen={<>
          {akte.objektId ? <Link className="secondary-button link-button arbeitsplatz-kopf-knopf" to={`/properties/${akte.objektId}`}>Immobilie öffnen</Link> : null}
          {akte.leadId ? <Link className="secondary-button link-button arbeitsplatz-kopf-knopf" to={`/leads/${akte.leadId}`}>Lead öffnen</Link> : null}
        </>} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
