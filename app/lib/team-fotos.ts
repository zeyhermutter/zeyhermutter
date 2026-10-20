// Fotos der Ansprechpartner (20.10.2026).
//
// Liegen in app/assets/team/ (siehe LIESMICH dort). Vorname.jpg = echtes Foto,
// Vorname-platzhalter.jpg = Platzhalter, der nur auf BETA erscheint -- ein
// Bild von irgendwem waere auf der echten Website eine Behauptung ueber die
// Person. Ohne Datei: Initialen.

const DATEIEN = import.meta.glob("../assets/team/*.{jpg,jpeg,png,webp}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export type TeamFoto = { src: string; platzhalter: boolean };

export function teamFoto(name: string | null | undefined): TeamFoto | null {
  const vorname = (name ?? "").trim().split(/\s+/)[0]?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!vorname) return null;
  const finde = (muster: RegExp) => Object.entries(DATEIEN).find(([pfad]) => muster.test(pfad.split("/").pop() ?? ""))?.[1] ?? null;
  const echt = finde(new RegExp(`^${vorname}\\.(jpe?g|png|webp)$`));
  if (echt) return { src: echt, platzhalter: false };
  if (__APP_ENV__ === "production") return null;
  const platzhalter = finde(new RegExp(`^${vorname}-platzhalter\\.(jpe?g|png|webp)$`));
  return platzhalter ? { src: platzhalter, platzhalter: true } : null;
}
