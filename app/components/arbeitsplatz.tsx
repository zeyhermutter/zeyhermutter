import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Ampel, useNaechsteSchritte } from "~/components/ampel";
import type { AmpelArt } from "~/lib/naechster-schritt";
import "~/arbeitsplatz.css";

// Der Arbeitsplatz -- Liste links, geoeffneter Datensatz rechts.
//
// WARUM EIN BAUSTEIN
//
// Am 12.10.2026 entstand er fuer die Immobilien. Mit den Kontakten kam der
// zweite Fall, und alle weiteren Bereiche sollen denselben Aufbau bekommen.
// Steht das Muster in jeder Route einzeln, sieht es nach dem dritten Bereich
// an drei Stellen dreimal ein bisschen anders aus -- Suchfeld mal links,
// mal rechts, der Fuss mal mit Zaehler, mal ohne. In einem Programm muss
// sich jeder Bereich gleich anfuehlen. Deshalb steht es hier, einmal.
//
// Was je Bereich verschieden ist, kommt als Eigenschaft herein: die Zeilen,
// der Kopf, die Reiter. Der Rest ist fuer alle gleich.

export type ArbeitsplatzZeile = {
  id: string;
  pfad: string;
  nummer: string;
  titel: string;
  /** Die zweite Zeile: Status, Ort, Preis -- was der Bereich zeigen will. */
  unterzeile: ReactNode;
  /** Wonach das Suchfeld filtert. Alles, was der Nutzer eintippen koennte. */
  suchtext: string;
};

export type ArbeitsplatzReiterEintrag = {
  beschriftung: string;
  pfad: string;
  /** Nur genau dieser Pfad ist aktiv -- fuer den Stammreiter, der sonst alle Unterseiten fraesse. */
  genau?: boolean;
  /**
   * Die Seiten unter diesem Reiter. Ist einer davon offen, ist der Reiter
   * aktiv, und sie stehen in einer zweiten, kleineren Zeile darunter.
   * Fuer Akten mit vielen Seiten (die Objektakte): neun Reiter statt
   * vierzehn Abschnitten nebeneinander.
   */
  unter?: ArbeitsplatzUnterEintrag[];
};

export type ArbeitsplatzUnterEintrag = {
  beschriftung: string;
  pfad: string;
  genau?: boolean;
  /** Fuehrt aus der Akte hinaus (eine andere Akte, gefiltert). Traegt einen Pfeil, ist nie aktiv. */
  hinaus?: boolean;
};

function passt(pathname: string, pfad: string, genau?: boolean) {
  const ohneAbfrage = pfad.split("?")[0];
  return genau
    ? pathname === ohneAbfrage || pathname === `${ohneAbfrage}/`
    : pathname === ohneAbfrage || pathname.startsWith(`${ohneAbfrage}/`);
}

/** Reiter fuer einen Datensatz, dessen Unterseiten feste Adressen haben. */
export function ArbeitsplatzReiter({ eintraege, beschriftung }: { eintraege: ArbeitsplatzReiterEintrag[]; beschriftung: string }) {
  const { pathname } = useLocation();
  const istAktiv = (e: ArbeitsplatzReiterEintrag) => e.unter
    ? e.unter.some((u) => !u.hinaus && passt(pathname, u.pfad, u.genau))
    : passt(pathname, e.pfad, e.genau);
  const aktiver = eintraege.find(istAktiv);
  const unterzeile = aktiver?.unter && (aktiver.unter.length > 1 || aktiver.unter.some((u) => u.hinaus)) ? aktiver.unter : null;

  return (
    <>
      <nav className="arbeitsplatz-reiter" aria-label={beschriftung}>
        {eintraege.map((e) => {
          const aktiv = e === aktiver;
          return (
            <Link key={e.pfad} to={e.pfad} className={`arbeitsplatz-reiter-eintrag${aktiv ? " aktiv" : ""}`} aria-current={aktiv ? "page" : undefined}>
              {e.beschriftung}
            </Link>
          );
        })}
      </nav>
      {unterzeile ? (
        <nav className="arbeitsplatz-unterreiter" aria-label={`${aktiver!.beschriftung}: Seiten`}>
          {unterzeile.map((u) => {
            const aktiv = !u.hinaus && passt(pathname, u.pfad, u.genau);
            return (
              <Link key={u.pfad} to={u.pfad}
                className={`arbeitsplatz-unterreiter-eintrag${aktiv ? " aktiv" : ""}${u.hinaus ? " hinaus" : ""}`}
                aria-current={aktiv ? "page" : undefined}>
                {u.beschriftung}
                {u.hinaus ? (
                  <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M3 9 9 3M9 3H4.5M9 3v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}

export function Arbeitsplatz({
  listenName,
  einzahl,
  mehrzahl,
  zeilen,
  aktiveId,
  geoeffnet,
  suchePlatzhalter,
  neu,
  volleListe,
  listeFehlt,
  abgeschnitten,
  kopf,
  reiter,
  seitenkopf = "zeigen",
  ampel,
  children,
}: {
  /** "Objektliste", "Kontaktliste" -- fuer Screenreader. */
  listenName: string;
  einzahl: string;
  mehrzahl: string;
  zeilen: ArbeitsplatzZeile[];
  aktiveId: string | undefined;
  /**
   * Der geoeffnete Datensatz, falls er nicht in der Liste steht --
   * archiviert, oder jenseits der Obergrenze. Er wird oben angezeigt, damit
   * man sieht, welcher offen ist.
   */
  geoeffnet?: ArbeitsplatzZeile | null;
  suchePlatzhalter: string;
  neu?: { pfad: string; beschriftung: string };
  volleListe: string;
  listeFehlt?: boolean;
  /** Hat die Liste die Obergrenze erreicht? Dann sagt der Fuss es. */
  abgeschnitten?: string | null;
  kopf: ReactNode;
  reiter: ReactNode;
  /**
   * "ausblenden", wenn die Seitenkoepfe der Unterseiten nur wiederholen, was
   * der Kopf darueber schon sagt (Nummer, Name). Bei den Kontakten ist das so.
   * Bei den Immobilien nicht: dort tragen die Koepfe Knoepfe und Zustaende.
   */
  seitenkopf?: "zeigen" | "ausblenden";
  /** Mit welchem Bereich die Zeilen ihre Ampel holen (P2-1). Ohne: keine Ampel. */
  ampel?: AmpelArt;
  children: ReactNode;
}) {
  const [suche, setSuche] = useState("");

  const sichtbar = useMemo(() => {
    const nadel = suche.trim().toLocaleLowerCase("de-DE");
    if (!nadel) return zeilen;
    return zeilen.filter((z) => z.suchtext.toLocaleLowerCase("de-DE").includes(nadel));
  }, [zeilen, suche]);

  const geoeffnetFehlt = geoeffnet && !zeilen.some((z) => z.id === geoeffnet.id);

  const staende = useNaechsteSchritte(ampel);

  const zeile = (z: ArbeitsplatzZeile, zusatz?: string) => {
    const aktiv = z.id === aktiveId;
    return (
      <Link key={z.id} className={`arbeitsplatz-zeile${aktiv ? " aktiv" : ""}`} to={z.pfad} aria-current={aktiv ? "page" : undefined}>
        <span className="arbeitsplatz-zeile-oben">
          <span className="arbeitsplatz-zeile-nummer">{z.nummer}{zusatz ? ` · ${zusatz}` : ""}</span>
          {ampel ? <Ampel s={staende[z.id]} kurz /> : null}
        </span>
        <strong>{z.titel}</strong>
        <small>{z.unterzeile}</small>
      </Link>
    );
  };

  return (
    <div className="arbeitsplatz">
      <aside className="arbeitsplatz-liste" aria-label={listenName}>
        <div className="arbeitsplatz-liste-kopf">
          <label className="arbeitsplatz-suche">
            <span className="sr-only">{mehrzahl} filtern</span>
            <input type="search" value={suche} onChange={(e) => setSuche(e.currentTarget.value)} placeholder={suchePlatzhalter} autoComplete="off" />
          </label>
          {neu ? <Link className="arbeitsplatz-neu" to={neu.pfad}>{neu.beschriftung}</Link> : null}
        </div>

        <div className="arbeitsplatz-zeilen">
          {listeFehlt ? <p className="arbeitsplatz-hinweis">Die Liste konnte nicht geladen werden. Der Datensatz rechts ist davon nicht betroffen.</p> : null}
          {geoeffnetFehlt && geoeffnet ? zeile(geoeffnet, "nicht in der Liste") : null}
          {sichtbar.map((z) => zeile(z))}
          {sichtbar.length === 0 && !listeFehlt && suche ? <p className="arbeitsplatz-hinweis">Nichts passt zu „{suche}“.</p> : null}
          {/* Die Liste ist gekappt: das Suchfeld filtert nur, was geladen ist. Kein stilles
              "nichts gefunden" -- der Weg in die Suche ueber alles steht da (P2-2). */}
          {abgeschnitten && suche.trim().length >= 2 ? (
            <p className="arbeitsplatz-hinweis">Durchsucht: {abgeschnitten}. <Link to={`/crm/search?q=${encodeURIComponent(suche.trim())}`}>In allen suchen →</Link></p>
          ) : null}
        </div>

        <div className="arbeitsplatz-liste-fuss">
          {sichtbar.length === zeilen.length
            ? `${zeilen.length} ${zeilen.length === 1 ? einzahl : mehrzahl}`
            : `${sichtbar.length} von ${zeilen.length} ${mehrzahl}`}
          {abgeschnitten ? ` · ${abgeschnitten}` : ""}
          {" · "}
          <Link to={volleListe}>Volle Liste</Link>
        </div>
      </aside>

      <section className="arbeitsplatz-akte" aria-label={`Geöffneter Datensatz`}>
        {kopf}
        {reiter}
        <div className={`arbeitsplatz-inhalt${seitenkopf === "ausblenden" ? " ohne-seitenkopf" : ""}`}>{children}</div>
      </section>
    </div>
  );
}

/** Der Kopf ueber dem Datensatz: Nummer, Status, Titel, eine Zeile Kontext. */
export function ArbeitsplatzKopf({ nummer, status, titel, kontext, aktionen }: {
  nummer: string;
  status?: ReactNode;
  titel: string;
  kontext?: string | null;
  /** Knoepfe rechts im Kopf, etwa "E-Mail" (14.10.2026). Was hier steht,
   * gilt fuer die ganze Akte und ist auf jedem Reiter erreichbar. */
  aktionen?: ReactNode;
}) {
  return (
    <div className="arbeitsplatz-kopf">
      <span className="arbeitsplatz-kopf-nummer">{nummer}</span>
      {status}
      <strong className="arbeitsplatz-kopf-titel">{titel}</strong>
      {kontext ? <span className="arbeitsplatz-kopf-ort">{kontext}</span> : null}
      {aktionen ? <span className="arbeitsplatz-kopf-aktionen">{aktionen}</span> : null}
    </div>
  );
}

/** Der Weg zur E-Mail eines Datensatzes: Mailprogramm oeffnen und die
 * E-Mail danach am Datensatz festhalten. Bis 14.10.2026 nur ueber die
 * Bereichsleiste erreichbar, die auf einer Akte nie zu sehen war. */
export function EmailKnopf({ art, id }: { art: "contact" | "lead" | "inquiry"; id: string }) {
  return <Link className="secondary-button link-button arbeitsplatz-kopf-knopf" to={`/crm/email?${art}_id=${encodeURIComponent(id)}`}>E-Mail</Link>;
}
