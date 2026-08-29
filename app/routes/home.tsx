import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ZeyherMutterOS · Staging" },
    { name: "description", content: "ZeyherMutterOS Staging-Grundsystem" },
  ];
}

const modules = [
  ["01", "CRM", "Kontakte, Aktivitäten und Aufgaben"],
  ["02", "Immobilien", "Objekte, Eigentümer und Dokumente"],
  ["03", "Eigentümer & Leads", "Akquise und Verkäufer-Pipeline"],
  ["04", "Interessenten & Besichtigungen", "Anfragen, Suchprofile und Termine"],
  ["05", "Website & Exposés", "Publikation und Dokumenterzeugung"],
  ["06", "Dashboard & Provisionen", "Steuerung, Pipeline und Umsatz"],
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">ZM</span>
          <span>ZeyherMutterOS</span>
        </div>
        <div className="top-actions">
          <span className="badge">STAGING</span>
          <a className="secondary-button compact" href="/login">Anmelden</a>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Phase 1 · CRM-Grundsystem</p>
        <h1>Das digitale Betriebssystem für ZeyherMutter.</h1>
        <p className="lead">
          Cloudflare Workers + React Router + Supabase. Dieses Staging-System ist vollständig von SeasonCrew getrennt.
        </p>
        <div className="status-grid">
          <div className="status"><strong>Cloudflare</strong><span>Workers · Staging live</span></div>
          <div className="status"><strong>Supabase</strong><span>Frankfurt · RLS aktiv</span></div>
          <div className="status"><strong>CRM</strong><span>Auth & Datenmodell im Aufbau</span></div>
        </div>
      </section>

      <section className="modules">
        <div className="section-head">
          <p className="eyebrow">Roadmap</p>
          <h2>Sechs Kernmodule</h2>
        </div>
        <div className="module-grid">
          {modules.map(([number, name, description]) => (
            <article className="module" key={number}>
              <span>{number}</span>
              <h3>{name}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
