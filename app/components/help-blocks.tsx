import type { HelpBlock, HelpChapter } from "~/help-content";

// Die Darstellung eines Kapitels. Wird von zwei Stellen benutzt: von der
// Anleitungsseite unter /crm/hilfe und vom Hilfe-Modal, das auf jeder internen
// Seite geoeffnet werden kann. Beide zeigen denselben Text, damit die Anleitung
// im Fenster und die Anleitung auf der Seite nie auseinanderlaufen.

// Erlaubt **fett** im Text, sonst nichts. Bewusst kein Markdown-Parser: der
// Inhalt steht im eigenen Repository, nicht in einer Datenbank.
export function HelpText({ inhalt }: { inhalt: string }) {
  const teile = inhalt.split(/(\*\*[^*]+\*\*)/g);
  return <>{teile.map((teil, i) => teil.startsWith("**") && teil.endsWith("**")
    ? <strong key={i}>{teil.slice(2, -2)}</strong>
    : <span key={i}>{teil}</span>)}</>;
}

// `spaeter` schaltet das verzoegerte Laden der Bilder ein. Das ist nur auf der
// durchgehenden Anleitungsseite sinnvoll, wo zwoelf Bilder untereinander
// stehen. Im Hilfe-Fenster muss es AUS bleiben: dort steckt das Bild in einem
// eigenen Scrollbereich und hat ohne geladene Datei die Hoehe null — der
// Browser sieht dann nie eine Ueberschneidung mit dem Sichtfeld und laedt das
// Bild nie. Live nachgewiesen: currentSrc blieb auch nach vier Sekunden leer.
export function HelpBlockView({ block, spaeter = false }: { block: HelpBlock; spaeter?: boolean }) {
  if (block.art === "absatz") return <p className="help-absatz"><HelpText inhalt={block.text} /></p>;
  if (block.art === "liste") return <ul className="help-liste">{block.punkte.map((p, i) => <li key={i}><HelpText inhalt={p} /></li>)}</ul>;
  if (block.art === "schritte") return <ol className="help-schritte">{block.punkte.map((p, i) => <li key={i}><HelpText inhalt={p} /></li>)}</ol>;
  if (block.art === "hinweis") return <div className="help-hinweis"><HelpText inhalt={block.text} /></div>;
  if (block.art === "warnung") return <div className="help-warnung"><HelpText inhalt={block.text} /></div>;
  return (
    <figure className="help-bild">
      <img src={`/hilfe/${block.datei}`} alt={block.unterschrift} loading={spaeter ? "lazy" : "eager"} width={block.breite} height={block.hoehe} />
      <figcaption>{block.unterschrift}</figcaption>
    </figure>
  );
}

export function HelpChapterBody({ kapitel, spaeter = false }: { kapitel: HelpChapter; spaeter?: boolean }) {
  return <>{kapitel.bloecke.map((b, i) => <HelpBlockView block={b} spaeter={spaeter} key={i} />)}</>;
}
