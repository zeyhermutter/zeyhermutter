import { istMobilnummer, whatsappGruss, whatsappLink, whatsappNummer } from "~/lib/whatsapp";

// WhatsApp-Knopf in der Kontaktakte (20.10.2026), siehe app/lib/whatsapp.ts.
// Erscheint nur bei einer Mobilnummer (Feld Mobil, sonst Telefon, wenn es
// eine deutsche Mobilnummer ist). Der Verlaufseintrag geht im Hintergrund
// an /api/whatsapp; WhatsApp oeffnet sich in einem neuen Fenster.

type Kontakt = { id: string; salutation?: string | null; first_name?: string | null; last_name?: string | null; mobile?: string | null; phone?: string | null };

export function WhatsAppKnopf({ kontakt }: { kontakt: Kontakt }) {
  const roh = kontakt.mobile && whatsappNummer(kontakt.mobile) ? kontakt.mobile : istMobilnummer(kontakt.phone) ? kontakt.phone : null;
  const nummer = whatsappNummer(roh);
  if (!nummer) return null;
  const festhalten = () => {
    const fd = new FormData();
    fd.set("kontakt_id", kontakt.id);
    fetch("/api/whatsapp", { method: "POST", body: fd, keepalive: true, credentials: "same-origin" }).catch(() => undefined);
  };
  return (
    <a className="secondary-button link-button compact" href={whatsappLink(nummer, whatsappGruss(kontakt))} target="_blank" rel="noopener noreferrer" onClick={festhalten}
      title="Öffnet WhatsApp mit einem vorbereiteten Gruß. Abgeschickt wird in WhatsApp; im Verlauf steht „WhatsApp geöffnet“.">
      WhatsApp
    </a>
  );
}
