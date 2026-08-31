import { useEffect, useState } from "react";
import { Form, useLocation } from "react-router";
import "~/viewing-replan-modal.css";

type Context = {
  propertyId: string;
  propertyLabel: string;
  contactId: string;
  contactLabel: string;
  searchProfileId: string;
  searchProfileLabel: string;
  inquiryId: string;
  inquiryLabel: string;
  meetingPoint: string;
  responsibleUser: string;
  responsibleOptions: Array<{ value: string; label: string }>;
};

function hrefId(selector: string, prefix: string) {
  const link = document.querySelector<HTMLAnchorElement>(selector);
  if (!link) return { id: "", label: "—" };
  const path = new URL(link.href, window.location.origin).pathname;
  return { id: path.startsWith(prefix) ? path.slice(prefix.length).split("/")[0] : "", label: link.textContent?.trim() || "—" };
}

function collectContext(): Context {
  const property = hrefId('a[href^="/properties/"]', "/properties/");
  const contact = hrefId('a[href^="/crm/contacts/"]', "/crm/contacts/");
  const searchProfile = hrefId('a[href^="/search-profiles/"]', "/search-profiles/");
  const inquiry = hrefId('a[href^="/inquiries/"]', "/inquiries/");
  const meetingPoint = document.querySelector<HTMLInputElement>('input[name="meeting_point"]')?.value ?? "";
  const responsible = document.querySelector<HTMLSelectElement>('select[name="primary_responsible_user"]');
  const responsibleOptions = responsible
    ? Array.from(responsible.options).map((option) => ({ value: option.value, label: option.textContent?.trim() || option.value }))
    : [];
  return {
    propertyId: property.id,
    propertyLabel: property.label,
    contactId: contact.id,
    contactLabel: contact.label,
    searchProfileId: searchProfile.id,
    searchProfileLabel: searchProfile.label,
    inquiryId: inquiry.id,
    inquiryLabel: inquiry.label,
    meetingPoint,
    responsibleUser: responsible?.value ?? "",
    responsibleOptions,
  };
}

function isReplanTrigger(button: HTMLButtonElement) {
  const form = button.closest("form");
  if (!form) return false;
  const intent = form.querySelector<HTMLInputElement>('input[name="_intent"]')?.value ?? "";
  const targetStatus = form.querySelector<HTMLInputElement>('input[name="status"]')?.value ?? "";
  if (intent !== "status" || targetStatus !== "PLANNED") return false;

  const label = (button.textContent ?? "").trim().toLocaleLowerCase("de-DE");
  return label.includes("neu") || label.includes("erneut") || label.includes("planen");
}

export function ViewingReplanModal() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Context | null>(null);

  useEffect(() => {
    if (!/^\/viewings\/[^/]+\/?$/.test(location.pathname)) return;

    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button");
      if (!button || !isReplanTrigger(button)) return;
      event.preventDefault();
      event.stopPropagation();
      setContext(collectContext());
      setOpen(true);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open || !context) return null;

  return (
    <div className="viewing-replan-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="viewing-replan-modal" role="dialog" aria-modal="true" aria-labelledby="viewing-replan-title">
        <div className="viewing-replan-head">
          <div>
            <p className="eyebrow">Besichtigung</p>
            <h2 id="viewing-replan-title">Neue Besichtigung planen</h2>
            <p>Bekannte Zuordnungen werden aus der bisherigen Besichtigung übernommen.</p>
          </div>
          <button className="viewing-replan-close" type="button" aria-label="Schließen" onClick={() => setOpen(false)}>×</button>
        </div>

        <div className="viewing-replan-context">
          <div><span>Immobilie</span><strong>{context.propertyLabel}</strong></div>
          <div><span>Interessent</span><strong>{context.contactLabel}</strong></div>
          <div><span>Suchprofil</span><strong>{context.searchProfileLabel}</strong></div>
          <div><span>Anfrage</span><strong>{context.inquiryLabel}</strong></div>
        </div>

        <Form method="post" action="/viewings/new" className="viewing-replan-form">
          <input type="hidden" name="property_id" value={context.propertyId}/>
          <input type="hidden" name="contact_id" value={context.contactId}/>
          <input type="hidden" name="search_profile_id" value={context.searchProfileId}/>
          <input type="hidden" name="inquiry_id" value={context.inquiryId}/>

          <div className="form-grid">
            <label className="form-field"><span>Beginn *</span><input name="starts_at" type="datetime-local" required autoFocus/></label>
            <label className="form-field"><span>Ende</span><input name="ends_at" type="datetime-local"/></label>
            <label className="form-field"><span>Treffpunkt</span><input name="meeting_point" defaultValue={context.meetingPoint}/></label>
            <label className="form-field"><span>Verantwortlich</span><select name="primary_responsible_user" defaultValue={context.responsibleUser}>{context.responsibleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          <label className="form-field"><span>Interne Notizen</span><textarea name="internal_notes" rows={3}/></label>

          <div className="viewing-replan-actions">
            <button className="secondary-button" type="button" onClick={() => setOpen(false)}>Abbrechen</button>
            <button className="primary-button" type="submit" disabled={!context.propertyId || !context.contactId}>Besichtigung anlegen</button>
          </div>
        </Form>
      </section>
    </div>
  );
}
