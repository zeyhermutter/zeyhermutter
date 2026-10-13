import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/anfrage-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { ANFRAGEKANAL, ANFRAGESTATUS, beschrifte } from "~/lib/labels";
import { zeitpunktKurz } from "~/lib/format";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";
import { standKlasse } from "~/lib/stand-ton";

// Der Arbeitsplatz der Anfragen: links die Liste, rechts der Datensatz.
// Derselbe Aufbau wie Kontakte und Objekte (13.10.2026).
// Der Seitenkopf wiederholte Nummer, Name, Kanal, Eingang und Status -- das steht im Kopf darueber.

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "inquiry.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "inquiries",
    spalten: "id,inquiry_number,status,channel,received_at,archived_at,contacts(first_name,last_name),properties(property_number)",
    sortierung: "received_at",
    id: params.inquiryId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh): { id: string; nummer: string; titel: string; stand: string; unter: string; kontext: string } => { const k = eins(r.contacts); const o = eins(r.properties); return {
      id: r.id, nummer: r.inquiry_number, titel: k ? `${k.last_name}, ${k.first_name}` : r.inquiry_number,
      stand: r.archived_at ? "Archiviert" : beschrifte(ANFRAGESTATUS, r.status),
      unter: o?.property_number ?? beschrifte(ANFRAGEKANAL, r.channel),
      kontext: [beschrifte(ANFRAGEKANAL, r.channel), o?.property_number, r.received_at ? `Eingang ${zeitpunktKurz(r.received_at)}` : null].filter(Boolean).join(" · ") }; };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function AnfrageArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { inquiryId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/inquiries/${z.id}`,
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
      listenName="Anfrageliste"
      einzahl="Anfrage"
      mehrzahl="Anfragen"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={inquiryId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer, Objekt …"
      neu={{ pfad: "/inquiries/new", beschriftung: "+ Neu" }}
      volleListe="/inquiries?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className={`status-pill ${standKlasse(akte.stand)}`}>{akte.stand}</span>} titel={akte.titel} kontext={akte.kontext} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
