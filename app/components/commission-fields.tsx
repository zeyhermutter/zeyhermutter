import { useMemo, useState } from "react";

export type CommissionPropertyOption = {
  id: string;
  property_number: string;
  internal_title: string;
  purchase_price: number | string | null;
  status: string;
};

export type CommissionPartyOption = {
  propertyId: string;
  contactId: string;
  side: "SELLER" | "BUYER";
  label: string;
};

export type CommissionOfferOption = {
  id: string;
  propertyId: string;
  contactId: string;
  label: string;
  amount: number | string;
  status: string;
};

export type CommissionProfileOption = { user_id: string; display_name: string };

export type CommissionInitialValues = {
  property_id?: string | null;
  purchase_offer_id?: string | null;
  party_contact_id?: string | null;
  side?: string | null;
  calculation_method?: string | null;
  calculation_basis?: number | string | null;
  agreed_percent?: number | string | null;
  agreed_fixed_amount?: number | string | null;
  actual_amount?: number | string | null;
  due_date?: string | null;
  invoice_reference?: string | null;
  paid_amount?: number | string | null;
  paid_at?: string | null;
  primary_responsible_user?: string | null;
  internal_notes?: string | null;
};

type Props = {
  properties: CommissionPropertyOption[];
  partyOptions: CommissionPartyOption[];
  offers: CommissionOfferOption[];
  profiles: CommissionProfileOption[];
  initial?: CommissionInitialValues;
  defaultResponsibleUser: string;
  disabled?: boolean;
  showPaymentFields?: boolean;
};

function euro(value: number | string | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(number);
}

export function CommissionFields({ properties, partyOptions, offers, profiles, initial, defaultResponsibleUser, disabled = false, showPaymentFields = true }: Props) {
  const [propertyId, setPropertyId] = useState(initial?.property_id ?? properties[0]?.id ?? "");
  const [side, setSide] = useState(initial?.side === "BUYER" ? "BUYER" : "SELLER");
  const [method, setMethod] = useState(initial?.calculation_method === "FIXED" ? "FIXED" : "PERCENT");
  const [partyId, setPartyId] = useState(initial?.party_contact_id ?? "");
  const [offerId, setOfferId] = useState(initial?.purchase_offer_id ?? "");

  const parties = useMemo(() => partyOptions.filter((party) => party.propertyId === propertyId && party.side === side), [partyOptions, propertyId, side]);
  const availableOffers = useMemo(() => offers.filter((offer) => offer.propertyId === propertyId), [offers, propertyId]);
  const property = properties.find((item) => item.id === propertyId);

  function changeProperty(next: string) {
    setPropertyId(next);
    if (!partyOptions.some((party) => party.propertyId === next && party.side === side && party.contactId === partyId)) setPartyId("");
    if (!offers.some((offer) => offer.propertyId === next && offer.id === offerId)) setOfferId("");
  }

  function changeSide(next: "SELLER" | "BUYER") {
    setSide(next);
    if (!partyOptions.some((party) => party.propertyId === propertyId && party.side === next && party.contactId === partyId)) setPartyId("");
  }

  return <fieldset disabled={disabled} className="commission-fieldset">
    <div className="form-grid">
      <label className="form-field"><span>Immobilie *</span><select name="property_id" value={propertyId} onChange={(event) => changeProperty(event.currentTarget.value)} required><option value="">Auswählen…</option>{properties.map((item) => <option value={item.id} key={item.id}>{item.property_number} · {item.internal_title}</option>)}</select><small className="subtle">{property ? `${property.status} · aktueller Kaufpreis ${euro(property.purchase_price)}` : "Nur Verkaufsimmobilien"}</small></label>
      <label className="form-field"><span>Provisionsseite *</span><select name="side" value={side} onChange={(event) => changeSide(event.currentTarget.value as "SELLER" | "BUYER")}><option value="SELLER">Innenprovision · Verkäuferseite</option><option value="BUYER">Außenprovision · Käuferseite</option></select></label>
      <label className="form-field"><span>Zahlende Partei</span><select name="party_contact_id" value={partyId} onChange={(event) => setPartyId(event.currentTarget.value)}><option value="">Noch offen</option>{parties.map((party) => <option value={party.contactId} key={`${party.side}-${party.propertyId}-${party.contactId}`}>{party.label}</option>)}</select><small className="subtle">{side === "SELLER" ? "Nur mit der Immobilie verknüpfte Eigentümer." : "Nur Interessenten mit Kaufangebot für diese Immobilie."}</small></label>
      <label className="form-field"><span>Kaufangebot / Vorgang</span><select name="purchase_offer_id" value={offerId} onChange={(event) => setOfferId(event.currentTarget.value)}><option value="">Ohne konkreten Angebotsbezug</option>{availableOffers.map((offer) => <option value={offer.id} key={offer.id}>{offer.label} · {euro(offer.amount)} · {offer.status}</option>)}</select></label>
      <label className="form-field"><span>Berechnungsart *</span><select name="calculation_method" value={method} onChange={(event) => setMethod(event.currentTarget.value as "PERCENT" | "FIXED")}><option value="PERCENT">Prozentual</option><option value="FIXED">Festbetrag</option></select></label>
      {method === "PERCENT" ? <>
        <label className="form-field"><span>Berechnungsgrundlage (€)</span><input name="calculation_basis" type="number" min="0" step="0.01" defaultValue={initial?.calculation_basis ?? property?.purchase_price ?? ""}/></label>
        <label className="form-field"><span>Vereinbart (%)</span><input name="agreed_percent" type="number" min="0.0001" max="100" step="0.0001" defaultValue={initial?.agreed_percent ?? ""}/></label>
        <input type="hidden" name="agreed_fixed_amount" value=""/>
      </> : <>
        <input type="hidden" name="agreed_percent" value=""/>
        <label className="form-field"><span>Vereinbarter Festbetrag (€)</span><input name="agreed_fixed_amount" type="number" min="0.01" step="0.01" defaultValue={initial?.agreed_fixed_amount ?? ""}/></label>
        <label className="form-field"><span>Berechnungsgrundlage (€) · optional</span><input name="calculation_basis" type="number" min="0" step="0.01" defaultValue={initial?.calculation_basis ?? property?.purchase_price ?? ""}/></label>
      </>}
      <label className="form-field"><span>Tatsächliche Provision (€)</span><input name="actual_amount" type="number" min="0" step="0.01" defaultValue={initial?.actual_amount ?? ""}/><small className="subtle">Nur eintragen, wenn sie vom errechneten Erwartungswert abweicht.</small></label>
      <label className="form-field"><span>Fälligkeit</span><input name="due_date" type="date" defaultValue={initial?.due_date ?? ""}/></label>
      <label className="form-field"><span>Rechnungsreferenz</span><input name="invoice_reference" defaultValue={initial?.invoice_reference ?? ""} placeholder="z. B. externe Rechnungsnummer"/><small className="subtle">Das CRM erstellt keine Rechnung.</small></label>
      {showPaymentFields ? <>
        <label className="form-field"><span>Bezahlter Betrag (€)</span><input name="paid_amount" type="number" min="0" step="0.01" defaultValue={initial?.paid_amount ?? 0}/></label>
        <label className="form-field"><span>Vollständig bezahlt am</span><input name="paid_at" type="date" defaultValue={initial?.paid_at ?? ""}/></label>
      </> : null}
      <label className="form-field"><span>Verantwortlich *</span><select name="primary_responsible_user" defaultValue={initial?.primary_responsible_user ?? defaultResponsibleUser} required>{profiles.map((profile) => <option key={profile.user_id} value={profile.user_id}>{profile.display_name}</option>)}</select></label>
    </div>
    <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={5} defaultValue={initial?.internal_notes ?? ""}/></label>
  </fieldset>;
}
