import { data, Link, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/provision-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { PROVISIONSSTATUS, beschrifte } from "~/lib/labels";
import { euroRund, tag } from "~/lib/format";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";
import { standKlasse } from "~/lib/stand-ton";

// Der Arbeitsplatz der Provisionen: links die Liste, rechts der Datensatz.
// Derselbe Aufbau wie Kontakte und Objekte (13.10.2026).
// Der Seitenkopf der Unterseite wiederholte Nummer, Objekt und Status ein
// zweites Mal (P1, 15.10.2026) -- er ist weg. "Immobilie öffnen" steht jetzt
// im Kopf hier, "Archivieren" unten in der Akte wie beim Abschluss.

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "commission.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "commissions",
    spalten: "id,commission_number,status,side,expected_amount,due_date,archived_at,property_id,contacts(first_name,last_name),properties(property_number,internal_title)",
    sortierung: "updated_at",
    id: params.commissionId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh): { id: string; nummer: string; titel: string; stand: string; unter: string; kontext: string; objektId: string | null } => { const k = eins(r.contacts); const o = eins(r.properties); return {
      id: r.id, nummer: r.commission_number, titel: o ? `${o.property_number} · ${r.side === "SELLER" ? "Innen" : "Außen"}` : r.commission_number,
      stand: r.archived_at ? "Archiviert" : beschrifte(PROVISIONSSTATUS, r.status),
      unter: [r.expected_amount != null ? euroRund(r.expected_amount) : null, k ? `${k.first_name} ${k.last_name}` : null].filter(Boolean).join(" · "),
      kontext: [r.side === "SELLER" ? "Innenprovision" : "Außenprovision", r.expected_amount != null ? `erwartet ${euroRund(r.expected_amount)}` : null, r.due_date ? `fällig ${tag(r.due_date)}` : null].filter(Boolean).join(" · "), objektId: r.property_id ?? null }; };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function ProvisionArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { commissionId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/commissions/${z.id}`,
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
      listenName="Provisionsliste"
      einzahl="Provision"
      mehrzahl="Provisionen"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={commissionId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Nummer, Objekt, Partei …"
      neu={{ pfad: "/commissions/new", beschriftung: "+ Neu" }}
      volleListe="/commissions?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? `die zuletzt bearbeiteten ${HOECHSTENS}` : null}
      seitenkopf="ausblenden"
      kopf={akte ? <ArbeitsplatzKopf nummer={akte.nummer} status={<span className={`status-pill ${standKlasse(akte.stand)}`}>{akte.stand}</span>} titel={akte.titel} kontext={akte.kontext}
        aktionen={akte.objektId ? <Link className="secondary-button link-button arbeitsplatz-kopf-knopf" to={`/properties/${akte.objektId}`}>Immobilie öffnen</Link> : null} /> : null}
      reiter={null}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
