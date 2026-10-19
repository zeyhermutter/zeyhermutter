import { DatensatzAuswahl, KontaktAuswahl } from "~/components/kontakt-auswahl";
import { useEffect, useRef, useState } from "react";
import { useDialogFokus } from "~/components/dialog-fokus";
import { Form } from "react-router";

type ProfileOption = { user_id: string; display_name: string };

type Props = {
  profiles: ProfileOption[];
  currentUserId: string;
};

// Lead, Objekt, Suchprofil, Anfrage und Besichtigung werden seit 19.10.2026
// gesucht statt aus je 500 vorab geladenen Datensaetzen gewaehlt.

export function TaskCreateModal({ profiles, currentUserId }: Props) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useDialogFokus(dialog, open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <div className="task-create-toolbar">
        <button className="primary-button" type="button" onClick={() => setOpen(true)}>+ Aufgabe anlegen</button>
      </div>
      {open ? (
        <div className="task-create-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="task-create-modal" role="dialog" aria-modal="true" aria-labelledby="task-create-title" tabIndex={-1} ref={dialog}>
            <div className="task-create-modal-head">
              <div><p className="eyebrow">Wiedervorlage</p><h2 id="task-create-title">Aufgabe anlegen</h2></div>
              <button className="task-create-modal-close" type="button" onClick={() => setOpen(false)} aria-label="Schließen">×</button>
            </div>
            <Form method="post" className="task-create-form">
              <input type="hidden" name="_intent" value="create" />
              <label><span>Titel *</span><input name="title" required autoFocus /></label>
              <label><span>Priorität</span><select name="priority" defaultValue="NORMAL"><option value="LOW">Niedrig</option><option value="NORMAL">Normal</option><option value="HIGH">Hoch</option><option value="URGENT">Dringend</option></select></label>
              <label className="wide"><span>Beschreibung</span><textarea name="description" rows={4} /></label>
              <label><span>Fällig *</span><input name="due_date" type="date" required /></label>
              <label><span>Verantwortlich</span><select name="responsible_user" defaultValue={currentUserId}>{profiles.map((item) => <option key={item.user_id} value={item.user_id}>{item.display_name}</option>)}</select></label>
              <KontaktAuswahl name="contact_id" beschriftung="Kontakt" hinweis="Leer lassen für eine Aufgabe ohne Kontaktbezug." />
              <DatensatzAuswahl art="LEAD" name="lead_id" beschriftung="Lead" />
              <DatensatzAuswahl art="PROPERTY" name="property_id" beschriftung="Immobilie" />
              <DatensatzAuswahl art="SEARCH_PROFILE" name="search_profile_id" beschriftung="Suchprofil" />
              <DatensatzAuswahl art="INQUIRY" name="inquiry_id" beschriftung="Anfrage" />
              <DatensatzAuswahl art="VIEWING" name="viewing_id" beschriftung="Besichtigung" hinweis="Alle Bezüge sind freiwillig; leer lassen für eine allgemeine Aufgabe." />
              <div className="task-create-modal-actions">
                <button className="secondary-button" type="button" onClick={() => setOpen(false)}>Abbrechen</button>
                <button className="primary-button" type="submit">Aufgabe speichern</button>
              </div>
            </Form>
          </section>
        </div>
      ) : null}
    </>
  );
}
