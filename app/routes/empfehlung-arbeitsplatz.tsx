import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/empfehlung-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { REFERRAL_STATUS } from "./referrals";
import { tag } from "~/lib/format";
import { eins, ladeArbeitsplatz } from "~/lib/arbeitsplatz.server";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";

// Der Arbeitsplatz der Empfehlungen: links die Liste, rechts der Datensatz.
// Derselbe Aufbau wie Kontakte und Objekte (13.10.2026).
// Der Seitenkopf wiederholte Nummer, Empfehlungsgeber und Status -- das steht im Kopf darueber.

const HOECHSTENS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Roh = any;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "referral.read");
  const { liste, listeFehlt, abgeschnitten, akte } = await ladeArbeitsplatz<Roh>(supabase, {
    tabelle: "referrals",
    spalten: "id,referral_number,status,referred_name,received_on,archived_at,referrer:contacts!referrals_referrer_contact_id_fkey(first_name,last_name),organizations(name)",
    sortierung: "updated_at",
    id: params.referralId,
    hoechstens: HOECHSTENS,
  });
  const alsZeile = (r: Roh): { id: string; nummer: string; titel: string; stand: string; unter: string; kontext: string } => { const k = eins(r.referrer); const org = eins(r.organizations); return {
      id: r.id, nummer: r.referral_number, titel: k ? `${k.last_name}, ${k.first_name}` : (org?.name ?? "Empfehlung"),
      stand: r.archived_at ? "Archiviert" : (REFERRAL_STATUS[r.status] ?? r.status),
      unter: r.referred_name ? `empfiehlt ${r.referred_name}` : "",
      kontext: [r.referred_name ? `empfiehlt ${r.referred_name}` : null, r.received_on ? `eingegangen ${tag(r.received_on)}` : null].filter(Boolean).join(" · ") }; };
  return data({ zeilen: liste.map(alsZeile), listeFehlt, abgeschnitten, akte: akte ? alsZeile(akte) : null }, { headers: responseHeaders() });
}

export default function EmpfehlungArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { referralId } = useParams();
  const alsZeile = (z: (typeof zeilen)[number]): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/referrals/${z.id}`,
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
      listenName="Empfehlungsliste"
      einzahl="Empfehlung"
      mehrzahl="Empfehlungen"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={referralId}
      geoeffnet={akte ? alsZeile(akte) : null}
      suchePlatzhalter="Name, Nummer …"
      neu={{ pfad: "/referrals?ansicht=tabelle#anlegen", beschriftung: "+ Neu" }}
      volleListe="/referrals?ansicht=tabelle"
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
