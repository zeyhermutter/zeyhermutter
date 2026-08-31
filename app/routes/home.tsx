import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ZeyherMutterOS · Staging" },
    { name: "description", content: "ZeyherMutterOS Staging-System" },
  ];
}

const modules = [
  ["01", "CRM", "Kontakte, Aktivitäten und Aufgaben", "DONE"],
  ["02", "Immobilien", "Objekte, Eigentümer und Dokumente", "DONE"],
  ["03", "Eigentümer & Leads", "Akquise und Verkäufer-Pipeline", "DONE"],
  ["04", "Interessenten & Besichtigungen", "Anfragen, Suchprofile und Termine", "IN ARBEIT"],
  ["05", "Website & Exposés", "Publikation und Dokumenterzeugung", "GEPLANT"],
  ["06", "Dashboard & Provisionen", "Steuerung, Pipeline und Umsatz", "GEPLANT"],
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">ZM</span><span>ZeyherMutterOS</span></div>
        <div className="top-actions"><span className="badge">STAGING</span><a className="secondary-button compact" href="/login">Anmelden</a></div>
      </header>
      <section className="hero">
        <p className="eyebrow">ZeyherMutterOS · Staging</p>
        <h1>Das digitale Betriebssystem für ZeyherMutter.</h1>
        <p className="lead">CRM, Immobilien, Verkäufer-Leads und Interessentenprozesse auf einer gemeinsamen, nachvollziehbaren Datenbasis.</p>
        <div className="status-grid"><div className="status"><strong>Cloudflare</strong><span>Workers · Staging</span></div><div className="status"><strong>Supabase</strong><span>Frankfurt · RLS aktiv</span></div><div className="status"><strong>Aktuell</strong><span>Modul 04 · Interessenten & Suchprofile</span></div></div>
      </section>
      <section className="modules"><div className="section-head"><p className="eyebrow">Roadmap</p><h2>Sechs Kernmodule</h2></div><div className="module-grid">{modules.map(([number,name,description,status])=><article className="module" key={number}><span>{number}</span><h3>{name}</h3><p>{description}</p><small>{status}</small></article>)}</div></section>
    </main>
  );
}
