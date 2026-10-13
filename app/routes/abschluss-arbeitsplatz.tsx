import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/abschluss-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { ABSCHLUSSSTATUS, beschrifte } from "~/lib/labels";
import { zeitpunktKurz } from "~/lib/format";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, ArbeitsplatzReiter, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";
import { standKlasse } from "~/lib/stand-ton";

// Der Arbeitsplatz der Abschlüsse: links die Liste, rechts der Datensatz.
// Derselbe Aufbau wie Kontakte und Objekte (13.10.2026).
// Zwei Reiter: der Abschluss und "Meilensteine & Übergabe" (vorher eine eigene Seite mit "← Abschlussakte"). Beide Seitenkoepfe wiederholten nur Nummer, Objekt, Kaeufer und Status.

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "closing.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "sale_closings",
    spalten: "id,closing_number,status,notary_appointment_at,archived_at,buyer:contacts!sale_closings_buyer_contact_id_fkey(first_name,last_name),properties(property_number,internal_title)",
    sortierung: "updated_at",
    id: params.closingId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh): { id: string; nummer: string; titel: string; stand: string; unter: string; kontext: string } => { const k = eins(r.buyer); const o = eins(r.properties); return {
      id: r.id, nummer: r.closing_number, titel: [o?.property_number, k ? `${k.last_name}, ${k.first_name}` : null].filter(Boolean).join(" · ") || r.closing_number,
      stand: r.archived_at ? "Archiviert" : beschrifte(ABSCHLUSSSTATUS, r.status),
      unter: o?.internal_title ?? "",
      kontext: [o?.internal_title, r.notary_appointment_at ? `Notartermin ${zeitpunktKurz(r.notary_appointment_at)}` : null].filter(Boolean).join(" · ") }; };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function AbschlussArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { closingId } = useParams();
  const basis = `/closings/${closingId}`;
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/closings/${z.id}`,
    nummer: z.nummer,
    titel: z.titel,
    suchtext: [z.nummer, z.titel, z.stand, z.unter].filter(Boolean).join(" "),
    unterzeile: <>
      <span className={`status-pill ${standKlasse(z.stand)}`}>{z.stand}</span>
      {z.unter ? <span>{z.unter}</span> : null}
    </>,
  });
  return (
    <Arbeitsplatz
      listenName="Abschlussliste"
      einzahl="Abschluss"
      mehrzahl="Abschlüsse"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={closingId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Käufer, Nummer, Objekt …"
      volleListe="/closings?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className={`status-pill ${standKlasse(akte.stand)}`}>{akte.stand}</span>} titel={akte.titel} kontext={akte.kontext} /> : null}
      reiter={
        <ArbeitsplatzReiter
          beschriftung="Bereiche"
          eintraege={[
            { beschriftung: "Abschluss", pfad: `${basis}`, genau: true },
            { beschriftung: "Meilensteine & Übergabe", pfad: `${basis}/milestones` },
          ]}
        />
      }
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
