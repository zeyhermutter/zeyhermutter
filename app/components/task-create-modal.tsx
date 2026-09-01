import { useEffect, useState } from "react";
import { Form } from "react-router";

type Option = { id: string; label: string };
type ProfileOption = { user_id: string; display_name: string };

type Props = {
  profiles: ProfileOption[];
  currentUserId: string;
  contacts: Option[];
  leads: Option[];
  properties: Option[];
  searchProfiles: Option[];
  inquiries: Option[];
  viewings: Option[];
};

export function TaskCreateModal({ profiles, currentUserId, contacts, leads, properties, searchProfiles, inquiries, viewings }: Props) {
  const [open, setOpen] = useState(false);

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
          <section className="task-create-modal" role="dialog" aria-modal="true" aria-labelledby="task-create-title">
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
              <label><span>Kontakt</span><select name="contact_id"><option value="">Ohne Kontaktbezug</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label><span>Lead</span><select name="lead_id"><option value="">Ohne Leadbezug</option>{leads.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label><span>Immobilie</span><select name="property_id"><option value="">Ohne Objektbezug</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label><span>Suchprofil</span><select name="search_profile_id"><option value="">Ohne Suchprofilbezug</option>{searchProfiles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label><span>Anfrage</span><select name="inquiry_id"><option value="">Ohne Anfragebezug</option>{inquiries.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label><span>Besichtigung</span><select name="viewing_id"><option value="">Ohne Besichtigungsbezug</option>{viewings.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
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
