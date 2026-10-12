import { data, Outlet, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/immobilien-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { euroRund } from "~/lib/format";
import { IMMOBILIENSTATUS, beschrifte } from "~/lib/labels";
import { IMMOBILIENARTEN } from "~/lib/public-intake";
import { ObjektakteReiter } from "~/components/objektakte-reiter";
import { Arbeitsplatz, ArbeitsplatzKopf, type ArbeitsplatzZeile } from "~/components/arbeitsplatz";
import "~/immobilien-arbeitsplatz.css";

// Der Arbeitsplatz einer Objektakte: links die Objektliste, rechts die Akte.
//
// WARUM
//
// Wer eine Immobilie oeffnete, verliess bisher die Liste. Um zur naechsten zu
// wechseln: zurueck, suchen, oeffnen. In einer Maklersoftware bleibt die
// Liste stehen, und die Akte oeffnet sich daneben -- so hat Sebastian es im
// Entwurf vom 12.10.2026 gesehen und abgenommen.
//
// WIE
//
// Eine Layout-Route ohne eigenen Pfad um alle Seiten unter
// /properties/:propertyId. Keine Adresse aendert sich, kein Lesezeichen
// bricht, und jede Unterseite behaelt ihren Ladeteil. Die Vorschauen
// (Exposé, Website) liegen bewusst ausserhalb: sie zeigen ein ganzes Blatt
// und gehoeren nicht in eine halbe Breite.
//
// Die Liste laedt nur, was eine Zeile zeigt. Ihre Abfrage laeuft bei jedem
// Wechsel innerhalb der Akte mit -- deshalb schlank und auf 300 begrenzt.

const LISTE_HOECHSTENS = 300;
const ART = new Map(IMMOBILIENARTEN);

type Zeile = {
  id: string;
  nummer: string;
  titel: string;
  status: string;
  ort: string | null;
  preis: string | null;
};

function ortAus(adresse: unknown): string | null {
  const a = (Array.isArray(adresse) ? adresse[0] : adresse) as { postal_code?: string | null; city?: string | null } | null | undefined;
  if (!a) return null;
  return [a.postal_code, a.city].filter(Boolean).join(" ") || null;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "property.read");

  const [listeRes, akteRes] = await Promise.all([
    supabase
      .from("properties")
      .select("id,property_number,internal_title,status,transaction_type,purchase_price,rent_cold,property_addresses(postal_code,city)")
      .neq("status", "ARCHIVED")
      .order("updated_at", { ascending: false })
      .limit(LISTE_HOECHSTENS),
    supabase
      .from("properties")
      .select("id,property_number,internal_title,status,property_type,transaction_type,property_addresses(postal_code,city)")
      .eq("id", params.propertyId ?? "")
      .maybeSingle(),
  ]);

  // Faellt die Liste aus, bleibt die Akte benutzbar: die Liste sagt dann,
  // dass sie nichts laden konnte, statt die ganze Seite zu verweigern.
  const zeilen: Zeile[] = (listeRes.data ?? []).map((p: any) => ({
    id: p.id,
    nummer: p.property_number,
    titel: p.internal_title,
    status: p.status,
    ort: ortAus(p.property_addresses),
    preis: p.transaction_type === "RENT"
      ? (p.rent_cold != null ? `${euroRund(p.rent_cold)} kalt` : null)
      : (p.purchase_price != null ? euroRund(p.purchase_price) : null),
  }));

  const akte = akteRes.data as any;
  return data({
    zeilen,
    listeFehlt: Boolean(listeRes.error),
    abgeschnitten: zeilen.length >= LISTE_HOECHSTENS,
    akte: akte ? {
      id: akte.id as string,
      nummer: akte.property_number as string,
      titel: akte.internal_title as string,
      status: akte.status as string,
      ort: ortAus(akte.property_addresses),
      // Was der Seitenkopf der Objektakte bisher zeigte und der Arbeitsplatz-
      // Kopf jetzt uebernimmt: Verkauf oder Vermietung, und die Objektart.
      // Eine unbekannte Art steht lieber gar nicht da als als Rohwert.
      art: [akte.transaction_type === "RENT" ? "Vermietung" : "Verkauf", ART.get(akte.property_type) ?? null].filter(Boolean).join(" · "),
    } : null,
  }, { headers: responseHeaders() });
}

function statusKlasse(status: string) {
  return `status-pill status-${status.toLowerCase().replaceAll("_", "-")}`;
}

export default function ImmobilienArbeitsplatz() {
  const { zeilen, listeFehlt, abgeschnitten, akte } = useLoaderData<typeof loader>();
  const { propertyId } = useParams();

  const alsZeile = (z: { id: string; nummer: string; titel: string; status: string; ort: string | null; preis?: string | null }): ArbeitsplatzZeile => ({
    id: z.id,
    pfad: `/properties/${z.id}`,
    nummer: z.nummer,
    titel: z.titel,
    suchtext: [z.nummer, z.titel, z.ort].filter(Boolean).join(" "),
    unterzeile: <>
      <span className={statusKlasse(z.status)}>{beschrifte(IMMOBILIENSTATUS, z.status)}</span>
      <span>{z.ort ?? "Ort offen"}</span>
      {z.preis ? <span className="arbeitsplatz-zeile-preis">{z.preis}</span> : null}
    </>,
  });

  return (
    <Arbeitsplatz
      listenName="Objektliste"
      einzahl="Objekt"
      mehrzahl="Objekte"
      zeilen={zeilen.map(alsZeile)}
      aktiveId={propertyId}
      geoeffnet={akte ? alsZeile({ ...akte, preis: null }) : null}
      suchePlatzhalter="Nummer, Titel, Ort …"
      neu={{ pfad: "/properties/new", beschriftung: "+ Neu" }}
      volleListe="/properties?ansicht=tabelle"
      listeFehlt={listeFehlt}
      abgeschnitten={abgeschnitten ? "die zuletzt bearbeiteten 300" : null}
      kopf={akte ? (
        <ArbeitsplatzKopf
          nummer={akte.nummer}
          status={<span className={statusKlasse(akte.status)}>{beschrifte(IMMOBILIENSTATUS, akte.status)}</span>}
          titel={akte.titel}
          kontext={[akte.art, akte.ort].filter(Boolean).join(" · ")}
        />
      ) : null}
      reiter={<ObjektakteReiter />}
    >
      <Outlet />
    </Arbeitsplatz>
  );
}
