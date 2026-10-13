import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/kaufangebot-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { KAUFANGEBOTSTATUS, beschrifte } from "~/lib/labels";
import { euroRund, tag } from "~/lib/format";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Angebote: links die Liste, rechts der Datensatz.
// Derselbe Aufbau wie Kontakte und Objekte (13.10.2026).
// Der Seitenkopf wiederholte Nummer, Betrag, Kaeufer, Objekt und Status -- das steht im Kopf darueber.

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "offer.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "purchase_offers",
    spalten: "id,offer_number,status,amount,valid_until,archived_at,contacts(first_name,last_name),properties(property_number,internal_title)",
    sortierung: "updated_at",
    id: params.offerId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh): { id: string; nummer: string; titel: string; stand: string; unter: string; kontext: string } => { const k = eins(r.contacts); const o = eins(r.properties); return {
      id: r.id, nummer: r.offer_number, titel: k ? `${k.last_name}, ${k.first_name}` : r.offer_number,
      stand: r.archived_at ? "Archiviert" : beschrifte(KAUFANGEBOTSTATUS, r.status),
      unter: [o?.property_number, r.amount != null ? euroRund(r.amount) : null].filter(Boolean).join(" · "),
      kontext: [r.amount != null ? euroRund(r.amount) : null, o ? `${o.property_number} · ${o.internal_title}` : null, r.valid_until ? `gültig bis ${tag(r.valid_until)}` : null].filter(Boolean).join(" · ") }; };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function KaufangebotArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { offerId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/purchase-offers/${z.id}`,
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
      listenName="Angebotsliste"
      einzahl="Angebot"
      mehrzahl="Angebote"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={offerId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer, Objekt …"
      neu={{ pfad: "/purchase-offers/new", beschriftung: "+ Neu" }}
      volleListe="/purchase-offers?ansicht=tabelle"
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
