import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/aufmass-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { zeitpunktKurz } from "~/lib/format";
import { AUFMASSPAKET, AUFMASSSTATUS, beschrifte } from "~/lib/labels";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Aufmaß-Aufträge: links die Auftraege, rechts einer.
// Derselbe Aufbau wie Kontakte und Objekte (12.10.2026). Der Seitenkopf
// wiederholte Nummer, Paket, Status und Objekt -- das steht im Kopf darueber.

const HOECHSTENS = 300;

type Roh = {
  id: string;
  order_number: string;
  service_package: string;
  status: string;
  appointment_at: string | null;
  object_postal_code: string | null;
  object_city: string | null;
  archived_at: string | null;
  contacts: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  properties: { property_number: string } | { property_number: string }[] | null;
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "measurement.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "measurement_orders",
    spalten: "id,order_number,service_package,status,appointment_at,object_postal_code,object_city,archived_at,contacts(first_name,last_name),properties(property_number)",
    sortierung: "updated_at",
    id: params.orderId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh) => {
    const k = eins(r.contacts);
    return {
      id: r.id,
      nummer: r.order_number,
      titel: k ? `${k.last_name}, ${k.first_name}` : (eins(r.properties)?.property_number ?? "Auftraggeber offen"),
      paket: beschrifte(AUFMASSPAKET, r.service_package),
      stand: r.archived_at ? "Archiviert" : beschrifte(AUFMASSSTATUS, r.status),
      ort: [r.object_postal_code, r.object_city].filter(Boolean).join(" ") || null,
      termin: r.appointment_at,
    };
  };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function AufmassArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { orderId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/measurements/${z.id}`,
    nummer: z.nummer,
    titel: z.titel,
    suchtext: [z.nummer, z.titel, z.paket, z.stand, z.ort].filter(Boolean).join(" "),
    unterzeile: <>
      <span className="status-pill">{z.stand}</span>
      <span>{z.ort ?? z.paket}</span>
    </>,
  });
  return (
    <Arbeitsplatz
      listenName="Aufmaßliste"
      einzahl="Auftrag"
      mehrzahl="Aufträge"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={orderId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer, Ort, Status …"
      neu={{ pfad: "/measurements/new", beschriftung: "+ Neu" }}
      volleListe="/measurements?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className="status-pill">{akte.stand}</span>} titel={akte.titel}
        kontext={[akte.paket, akte.ort, akte.termin ? `Termin ${zeitpunktKurz(akte.termin)}` : null].filter(Boolean).join(" · ")} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
