import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/reservierung-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { tag } from "~/lib/format";
import { ladeArbeitsplatz, eins } from "~/lib/arbeitsplatz.server";
import { contactLabel, reservierungStand } from "~/lib/reservierung";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Reservierungen: links die Liste, rechts die Akte.
// Derselbe Aufbau wie Kontakte und Makleraufträge (13.10.2026).

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "reservation.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "property_reservations",
    spalten: "id,reservation_number,status,reserved_from,reserved_until,archived_at,properties(property_number,internal_title),contacts(first_name,last_name)",
    sortierung: "created_at",
    id: params.reservationId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh) => {
    const objekt = eins(r.properties) as Roh, kontakt = eins(r.contacts) as Roh;
    const stand = reservierungStand(r);
    return {
      id: r.id as string, nummer: r.reservation_number as string,
      titel: contactLabel(kontakt) || "Interessent offen",
      objekt: objekt ? `${objekt.property_number} · ${objekt.internal_title}` : "",
      stand: stand.text, klasse: stand.klasse,
      zeitraum: `${tag(r.reserved_from)} – ${tag(r.reserved_until)}`,
    };
  };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function ReservierungArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { reservationId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/reservations/${z.id}`,
    nummer: z.nummer,
    titel: z.titel,
    suchtext: [z.nummer, z.titel, z.objekt, z.stand].filter(Boolean).join(" "),
    unterzeile: <>
      <span className={`status-pill ${z.klasse}`}>{z.stand}</span>
      <span>bis {z.zeitraum.split(" – ")[1]}</span>
    </>,
  });
  return (
    <Arbeitsplatz
      listenName="Reservierungsliste"
      einzahl="Reservierung"
      mehrzahl="Reservierungen"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={reservationId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Nummer, Objekt, Interessent …"
      neu={{ pfad: "/reservations?ansicht=tabelle&neu=1#anlegen", beschriftung: "+ Neu" }}
      volleListe="/reservations?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt angelegten ${HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className={`status-pill ${akte.klasse}`}>{akte.stand}</span>} titel={akte.titel} kontext={`${akte.objekt} · ${akte.zeitraum}`} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
