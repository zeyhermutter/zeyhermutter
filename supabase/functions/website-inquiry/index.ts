import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const INQUIRY_CONSENT_VERSION = "website-inquiry-v1-2026-08-31";
const SELLER_CHECK_CONSENT_VERSION = "seller-check-v1-2026-09-01";
const VALUATION_CONSENT_VERSION = "valuation-v1-2026-09-08";
const SEARCH_PROFILE_CONSENT_VERSION = "search-profile-v1-2026-09-08";
const SELLER_CHECK_KINDS = new Set(["DETACHED_HOUSE", "SEMI_DETACHED_HOUSE", "TERRACED_HOUSE", "APARTMENT_BUILDING", "APARTMENT", "PENTHOUSE", "MAISONETTE", "LAND", "COMMERCIAL", "OFFICE", "RETAIL", "OTHER"]);
const SELLER_CHECK_SUPPORT = new Set(["ASSESSMENT", "COORDINATION", "DOCUMENTS", "MARKETING"]);

const SEARCH_TRANSACTIONS = new Set(["BUY", "RENT"]);

// Welcher Weg legt was an, und welche Zeile der Zielsteuerung gilt dafuer.
// Frueher stand das an vier Stellen verstreut im Ablauf; mit drei Wegen mehr
// waere daraus eine Sammlung von Sonderfaellen geworden.
const WEGE = {
  GENERAL:        { tabelle: "inquiries",       konfig: null,             einwilligung: INQUIRY_CONSENT_VERSION },
  PROPERTY:       { tabelle: "inquiries",       konfig: null,             einwilligung: INQUIRY_CONSENT_VERSION },
  SELLER_CHECK:   { tabelle: "leads",           konfig: "SELLER_CHECK",   einwilligung: SELLER_CHECK_CONSENT_VERSION },
  VALUATION:      { tabelle: "leads",           konfig: "VALUATION",      einwilligung: VALUATION_CONSENT_VERSION },
  SEARCH_PROFILE: { tabelle: "search_profiles", konfig: "SEARCH_PROFILE", einwilligung: SEARCH_PROFILE_CONSENT_VERSION },
} as const;

type IntakeKind = keyof typeof WEGE;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function clean(value: unknown, max: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}
function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}
function processingFailed(stage: string, error?: { code?: string } | null) {
  console.error("website-inquiry processing failed", { stage, code: error?.code ?? "UNKNOWN" });
  return response({ ok: false, error: "PROCESSING_FAILED" }, 500);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response({ ok: false }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return response({ ok: false }, 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  const rawKind = clean(body.kind, 40) || "PROPERTY";
  if (!Object.hasOwn(WEGE, rawKind)) {
    return response({ ok: false, error: "INVALID_INPUT" }, 400);
  }
  const kind = rawKind as IntakeKind;

  const firstName = clean(body.first_name, 100);
  const lastName = clean(body.last_name, 100);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 60);
  const message = clean(body.message, 4000);
  const slug = clean(body.slug, 100);
  const submissionKey = clean(body.submission_key, 80);
  const honeypot = clean(body.company, 120);
  const sourceUrl = clean(body.source_url, 500);

  if (honeypot) return response({ ok: true });
  if (!firstName || !lastName || !validEmail(email) || !submissionKey || body.consent !== true) {
    return response({ ok: false, error: "INVALID_INPUT" }, 400);
  }
  if (WEGE[kind].tabelle === "inquiries" && message.length < 10) return response({ ok: false, error: "INVALID_INPUT" }, 400);
  if (kind === "PROPERTY" && !slug) return response({ ok: false, error: "INVALID_INPUT" }, 400);

  const postalCode = clean(body.postal_code, 5);
  const city = clean(body.city, 120);
  const propertyType = clean(body.property_type, 40);
  const propertyCondition = clean(body.property_condition, 160);
  const saleTimeframe = clean(body.sale_timeframe, 160);
  const requestedSupport = Array.isArray(body.requested_support)
    ? [...new Set(body.requested_support.map((value) => clean(value, 40)).filter((value) => SELLER_CHECK_SUPPORT.has(value)))]
    : [];

  if (kind === "SELLER_CHECK" && (
    !/^\d{5}$/.test(postalCode)
    || city.length < 2
    || !SELLER_CHECK_KINDS.has(propertyType)
    || propertyCondition.length < 2
    || saleTimeframe.length < 2
    || requestedSupport.length === 0
  )) return response({ ok: false, error: "INVALID_INPUT" }, 400);

  // Die Bewertungsanfrage fragt dasselbe ab wie der Check, ohne die Auswahl
  // der gewuenschten Unterstuetzung: wer eine Einschaetzung will, hat sich
  // ueber Massnahmen noch keine Gedanken gemacht.
  if (kind === "VALUATION" && (
    !/^\d{5}$/.test(postalCode)
    || city.length < 2
    || !SELLER_CHECK_KINDS.has(propertyType)
    || propertyCondition.length < 2
    || saleTimeframe.length < 2
  )) return response({ ok: false, error: "INVALID_INPUT" }, 400);

  const transactionType = clean(body.transaction_type, 10);
  const searchTypes = Array.isArray(body.property_types)
    ? [...new Set(body.property_types.map((value) => clean(value, 40)).filter((value) => SELLER_CHECK_KINDS.has(value)))]
    : [];
  const maxPrice = Number(body.max_price);
  const minRooms = Number(body.min_rooms);
  const minLivingArea = Number(body.min_living_area);

  // Ein Suchprofil ohne Ort laesst sich in der Datenbank gar nicht anlegen --
  // ein aufgeschobener Ausloeser verlangt mindestens eine Ortsangabe. Deshalb
  // wird hier schon abgelehnt statt spaeter mit einem Fehler zu enden.
  if (kind === "SEARCH_PROFILE" && (
    !SEARCH_TRANSACTIONS.has(transactionType)
    || searchTypes.length === 0
    || (!/^\d{5}$/.test(postalCode) && city.length < 2)
  )) return response({ ok: false, error: "INVALID_INPUT" }, 400);

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  let propertyId: string | null = null;
  let propertyNumber: string | null = null;
  let responsibleUser: string | null = null;

  if (kind === "PROPERTY") {
    const { data: published, error: publishedError } = await db
      .from("property_publication_versions")
      .select("public_slug,snapshot")
      .eq("public_slug", slug)
      .eq("is_current_public", true)
      .not("published_at", "is", null)
      .maybeSingle();
    if (publishedError || !published) return response({ ok: false, error: "OBJECT_NOT_AVAILABLE" }, 404);
    propertyId = String((published.snapshot as { property_id?: string })?.property_id ?? "") || null;
    if (!propertyId) return response({ ok: false, error: "OBJECT_NOT_AVAILABLE" }, 404);
    const { data: property, error: propertyError } = await db
      .from("properties")
      .select("id,property_number,primary_responsible_user")
      .eq("id", propertyId)
      .maybeSingle();
    if (propertyError || !property) return response({ ok: false, error: "OBJECT_NOT_AVAILABLE" }, 404);
    propertyNumber = property.property_number;
    responsibleUser = property.primary_responsible_user ?? null;
  }

  const konfigSchluessel = WEGE[kind].konfig;
  if (konfigSchluessel) {
    const { data: config, error: configError } = await db
      .from("sales_readiness_public_intake_config")
      .select("enabled,responsible_user")
      .eq("id", konfigSchluessel)
      .maybeSingle();
    // Ein Formular ohne eingetragenen Empfaenger nimmt Anfragen entgegen, die
    // niemandem auffallen. Lieber sagen, dass der Weg zu ist.
    if (configError || !config?.enabled || !config.responsible_user) {
      return response({ ok: false, error: "INTAKE_NOT_ENABLED", intake: konfigSchluessel }, 503);
    }
    responsibleUser = String(config.responsible_user);
    const { data: responsibleProfile, error: responsibleError } = await db
      .from("profiles")
      .select("user_id,status")
      .eq("user_id", responsibleUser)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (responsibleError || !responsibleProfile) {
      return response({ ok: false, error: "INTAKE_ROUTING_NOT_CONFIGURED", intake: konfigSchluessel }, 503);
    }
  }

  const { data: bereitsDa, error: dublettenFehler } = await db
    .from(WEGE[kind].tabelle)
    .select("id")
    .eq("website_submission_key", submissionKey)
    .maybeSingle();
  if (dublettenFehler) return processingFailed(`${WEGE[kind].tabelle}_deduplication`, dublettenFehler);
  if (bereitsDa) return response({ ok: true, deduplicated: true });

  const fingerprint = await sha256(`${email}|${kind}|${propertyId ?? (postalCode || city || "GENERAL")}`);
  const { data: allowed, error: rateError } = await db.rpc("consume_public_form_rate_limit", {
    p_fingerprint: fingerprint,
    p_limit: 3,
    p_window_minutes: 30,
  });
  if (rateError || allowed !== true) return response({ ok: false, error: "RATE_LIMIT" }, 429);

  const { data: duplicates, error: duplicateError } = await db.rpc("find_contact_duplicates", {
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email,
    p_mobile: phone || null,
    p_street: null,
    p_house_number: null,
    p_postal_code: postalCode || null,
    p_city: city || null,
    p_exclude_contact_id: null,
  });
  if (duplicateError) return processingFailed("contact_deduplication", duplicateError);
  const duplicate = (duplicates ?? []).find((item: any) => Array.isArray(item.reasons) && item.reasons.includes("EMAIL"))
    ?? (duplicates ?? []).find((item: any) => Array.isArray(item.reasons) && item.reasons.includes("MOBILE") && String(item.first_name).toLowerCase() === firstName.toLowerCase() && String(item.last_name).toLowerCase() === lastName.toLowerCase());

  let contactId = duplicate?.contact_id ?? null;
  if (!contactId) {
    const { data: createdContact, error: contactError } = await db.from("contacts").insert({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      preferred_channel: "EMAIL",
      primary_responsible_user: responsibleUser,
      created_by: null,
      updated_by: null,
    }).select("id").single();
    if (contactError || !createdContact) return processingFailed("contact_creation", contactError);
    contactId = createdContact.id;
  }

  if (kind === "SEARCH_PROFILE") {
    const ortText = [postalCode, city].filter(Boolean).join(" ") || "ohne Ortsangabe";
    const { data: result, error: profileError } = await db.rpc("create_public_search_profile", {
      p_contact_id: contactId,
      p_responsible_user: responsibleUser,
      p_submission_key: submissionKey,
      p_source_url: sourceUrl || "/suchauftrag",
      p_transaction_type: transactionType,
      p_property_types: searchTypes,
      p_max_price: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : null,
      p_min_rooms: Number.isFinite(minRooms) && minRooms > 0 ? minRooms : null,
      p_min_living_area: Number.isFinite(minLivingArea) && minLivingArea > 0 ? minLivingArea : null,
      p_postal_code: postalCode || null,
      p_city: city || null,
      p_message: message,
      p_consent_text_version: SEARCH_PROFILE_CONSENT_VERSION,
    });
    if (profileError || !result?.[0]) return processingFailed("search_profile_creation", profileError);
    const profile = result[0];
    if (!profile.out_deduplicated) {
      await db.from("activity_events").insert({
        activity_type: "WEBSITE_SEARCH_PROFILE",
        title: "Suchauftrag über die Website",
        description: `Neuer Suchauftrag für ${ortText}`,
        actor_user_id: null,
        contact_id: contactId,
        metadata: { source: "PUBLIC_WEBSITE", kind, consent_version: SEARCH_PROFILE_CONSENT_VERSION, property_types: searchTypes, transaction_type: transactionType },
      });
      await db.from("notifications").insert({
        user_id: responsibleUser,
        type: "WEBSITE_SEARCH_PROFILE",
        title: "Neuer Suchauftrag",
        message: `Suchauftrag ${profile.out_profile_number} für ${ortText}`,
        entity_type: "SEARCH_PROFILE",
        entity_id: profile.out_profile_id,
      });
    }
    return response({ ok: true, deduplicated: Boolean(profile.out_deduplicated) });
  }

  if (kind === "SELLER_CHECK" || kind === "VALUATION") {
    const istBewertung = kind === "VALUATION";
    const sellerMessage = [
      message || "Keine zusätzliche Nachricht.",
      `Immobilie: ${propertyType} · ${postalCode} ${city}`,
      `Zustand: ${propertyCondition}`,
      `Verkaufszeitraum: ${saleTimeframe}`,
      istBewertung ? null : `Gewünschte Unterstützung: ${requestedSupport.join(", ")}`,
    ].filter(Boolean).join("\n");
    const { data: result, error: leadError } = await db.rpc("create_public_seller_check_lead", {
      p_contact_id: contactId,
      p_responsible_user: responsibleUser,
      p_submission_key: submissionKey,
      p_source_url: sourceUrl || (istBewertung ? "/bewertung" : "/verkaufsfertig-check"),
      p_message: sellerMessage,
      p_property_postal_code: postalCode,
      p_property_city: city,
      p_property_type: propertyType,
      p_property_condition: propertyCondition,
      p_desired_sale_horizon: saleTimeframe,
      p_consent_text_version: WEGE[kind].einwilligung,
      p_source_detail: istBewertung ? "Bewertungsanfrage · Website" : "Verkaufsstrategie-Check · Website",
    });
    if (leadError || !result?.[0]) return processingFailed("seller_lead_creation", leadError);
    const lead = result[0];
    if (!lead.out_deduplicated) {
      await db.from("activity_events").insert({
        activity_type: istBewertung ? "WEBSITE_VALUATION" : "WEBSITE_SELLER_CHECK",
        title: istBewertung ? "Bewertung angefragt" : "Verkaufsstrategie-Check angefragt",
        description: `Neue Website-Anfrage aus ${postalCode} ${city}`,
        actor_user_id: null,
        contact_id: contactId,
        lead_id: lead.out_lead_id,
        metadata: { source: "PUBLIC_WEBSITE", kind, consent_version: WEGE[kind].einwilligung, requested_support: istBewertung ? [] : requestedSupport },
      });
      await db.from("notifications").insert({
        user_id: responsibleUser,
        type: istBewertung ? "WEBSITE_VALUATION" : "WEBSITE_SELLER_CHECK",
        title: istBewertung ? "Neue Bewertungsanfrage" : "Neuer Verkaufsstrategie-Check",
        message: `Neue Anfrage ${lead.out_lead_number} aus ${postalCode} ${city}`,
        entity_type: "LEAD",
        entity_id: lead.out_lead_id,
      });
    }
    return response({ ok: true, deduplicated: Boolean(lead.out_deduplicated) });
  }

  const sourceLabel = kind === "PROPERTY" ? "ZeyherMutter Website" : "ZeyherMutter Website · Kontakt";
  const { data: inquiry, error: inquiryError } = await db.from("inquiries").insert({
    contact_id: contactId,
    property_id: propertyId,
    status: "NEW",
    channel: "WEBSITE",
    source_label: sourceLabel,
    message,
    primary_responsible_user: responsibleUser,
    created_by: null,
    updated_by: null,
    website_submission_key: submissionKey,
    consent_given_at: new Date().toISOString(),
    consent_text_version: INQUIRY_CONSENT_VERSION,
    public_source_url: sourceUrl || (kind === "PROPERTY" ? `/immobilien/${slug}` : "/kontakt"),
  }).select("id,inquiry_number").single();
  if (inquiryError) {
    if (String(inquiryError.message ?? "").toLowerCase().includes("website_submission_key")) return response({ ok: true, deduplicated: true });
    return processingFailed("inquiry_creation", inquiryError);
  }

  await db.from("activity_events").insert({
    activity_type: "WEBSITE_INQUIRY",
    title: "Website-Anfrage eingegangen",
    description: kind === "PROPERTY" ? `Neue Website-Anfrage zu ${propertyNumber}` : "Neue allgemeine Website-Anfrage",
    actor_user_id: null,
    contact_id: contactId,
    property_id: propertyId,
    inquiry_id: inquiry.id,
    metadata: { source: "PUBLIC_WEBSITE", kind, consent_version: INQUIRY_CONSENT_VERSION },
  });

  let notificationUsers: string[] = [];
  if (responsibleUser) notificationUsers = [responsibleUser];
  else {
    const { data: profiles } = await db.from("profiles").select("user_id").eq("status", "ACTIVE").limit(20);
    notificationUsers = (profiles ?? []).map((profile: any) => profile.user_id).filter(Boolean);
  }
  if (notificationUsers.length) {
    await db.from("notifications").insert(notificationUsers.map((userId) => ({
      user_id: userId,
      type: "WEBSITE_INQUIRY",
      title: "Neue Website-Anfrage",
      message: kind === "PROPERTY" ? `Neue Anfrage zu ${propertyNumber}` : "Neue allgemeine Kontaktanfrage",
      entity_type: "INQUIRY",
      entity_id: inquiry.id,
    })));
  }
  return response({ ok: true });
});
