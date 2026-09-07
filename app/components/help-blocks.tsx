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

// Die Bilder laden sofort, nicht verzoegert.
//
// loading="lazy" war der erste Versuch und hat hier nie ausgeloest — weder im
// Hilfe-Fenster noch auf der durchgehenden Seite. Am BETA-Stand d1bc433
// nachgemessen: Fenster auf 1200 px gescrollt, erstes Bild bei 13 px voll im
// Sichtfeld, Breite und Hoehe gesetzt, kein scrollender Vorfahr — und nach
// zweieinhalb Sekunden immer noch naturalWidth 0. Ein Bild, das vielleicht
// erscheint, ist in einer Anleitung schlechter als eines, das laedt.
//
// Der Preis ist gering: zwoelf Bilder, zusammen 528 KB, auf einer internen
// Seite, die niemand im Minutentakt oeffnet. Breite und Hoehe bleiben gesetzt,
// damit der Platz reserviert ist und beim Laden nichts springt.
export function HelpBlockView({ block }: { block: HelpBlock }) {
  if (block.art === "absatz") return <p className="help-absatz"><HelpText inhalt={block.text} /></p>;
  if (block.art === "liste") return <ul className="help-liste">{block.punkte.map((p, i) => <li key={i}><HelpText inhalt={p} /></li>)}</ul>;
  if (block.art === "schritte") return <ol className="help-schritte">{block.punkte.map((p, i) => <li key={i}><HelpText inhalt={p} /></li>)}</ol>;
  if (block.art === "hinweis") return <div className="help-hinweis"><HelpText inhalt={block.text} /></div>;
  if (block.art === "warnung") return <div className="help-warnung"><HelpText inhalt={block.text} /></div>;
  return (
    <figure className="help-bild">
      <img src={`/hilfe/${block.datei}`} alt={block.unterschrift} width={block.breite} height={block.hoehe} />
      <figcaption>{block.unterschrift}</figcaption>
    </figure>
  );
}

export function HelpChapterBody({ kapitel }: { kapitel: HelpChapter }) {
  return <>{kapitel.bloecke.map((b, i) => <HelpBlockView block={b} key={i} />)}</>;
}
