import { useState } from "react";
import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-documents";
import { AssetPreviewModal, type AssetPreviewKind } from "~/components/asset-preview-modal";
import { requirePermission } from "~/lib/auth.server";
import "~/property-documents.css";

type ActionResult = { error?: string };
type DocumentVersionRow = {
  id: string;
  document_id: string;
  version_number: number;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  sha256: string;
  change_reason: string | null;
  uploaded_at: string;
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

const CATEGORIES = [
  ["LAND_REGISTER", "Grundbuch"],
  ["CADASTRAL_MAP", "Flurkarte"],
  ["FLOOR_PLAN", "Grundriss"],
  ["LIVING_AREA_CALCULATION", "Wohnflächenberechnung"],
  ["ENERGY_CERTIFICATE", "Energieausweis"],
  ["DECLARATION_OF_DIVISION", "Teilungserklärung"],
  ["BUILDING_DOCUMENTS", "Bauunterlagen"],
  ["TENANCY_AGREEMENT", "Mietvertrag"],
  ["WEG", "WEG-Unterlagen"],
  ["BUSINESS_PLAN", "Wirtschaftsplan"],
  ["MINUTES", "Protokolle"],
  ["BROKERAGE_AGREEMENT", "Maklervertrag"],
  ["PHOTOS", "Fotos"],
  ["NOTARY", "Notar"],
  ["INVOICE", "Rechnung"],
  ["OTHER", "Sonstige"],
] as const;

const CLASSIFICATIONS = [
  ["PUBLIC", "Öffentlich"],
  ["INTERNAL", "Intern"],
  ["CONFIDENTIAL", "Vertraulich"],
] as const;

const CATEGORY_VALUES = new Set(CATEGORIES.map(([value]) => value));
const CLASSIFICATION_VALUES = new Set(CLASSIFICATIONS.map(([value]) => value));

function text(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function categoryLabel(value: string) {
  return CATEGORIES.find(([key]) => key === value)?.[1] ?? value;
}

function classificationLabel(value: string) {
  return CLASSIFICATIONS.find(([key]) => key === value)?.[1] ?? value;
}

function safeFilename(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned.slice(-140) || "datei";
}

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function previewKind(mimeType?: string | null): AssetPreviewKind {
  if (!mimeType) return "file";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "document.read");
  const propertyId = params.propertyId;

  const [{ data: property, error: propertyError }, { data: documents, error: documentError }] = await Promise.all([
    supabase.from("properties").select("id, property_number, internal_title").eq("id", propertyId).maybeSingle(),
    supabase.from("documents").select("id, category, classification, title, description, current_version, created_at, archived_at, version").eq("property_id", propertyId).is("archived_at", null).order("created_at", { ascending: false }),
  ]);
  if (propertyError || !property) throw new Response("Immobilie nicht gefunden.", { status: 404, headers: responseHeaders() });
  if (documentError) throw new Response("Dokumente konnten nicht geladen werden.", { status: 500, headers: responseHeaders() });

  const ids = (documents ?? []).map((document) => document.id);
  const { data: versionRows, error: versionError } = ids.length
    ? await supabase.from("document_versions").select("id, document_id, version_number, storage_bucket, storage_path, original_filename, mime_type, file_size_bytes, sha256, change_reason, uploaded_at").in("document_id", ids).order("version_number", { ascending: false })
    : { data: [] as DocumentVersionRow[], error: null };
  if (versionError) throw new Response("Dokumentversionen konnten nicht geladen werden.", { status: 500, headers: responseHeaders() });
  const versions: DocumentVersionRow[] = versionRows ?? [];

  const signedUrls: Record<string, string> = {};
  await Promise.all((versions ?? []).map(async (version) => {
    const { data: signed } = await supabase.storage.from(version.storage_bucket).createSignedUrl(version.storage_path, 600);
    if (signed?.signedUrl) signedUrls[version.id] = signed.signedUrl;
  }));

  const versionMap: Record<string, DocumentVersionRow[]> = {};
  for (const version of versions) {
    (versionMap[version.document_id] ??= []).push(version);
  }

  const { data: canArchive } = await supabase.rpc("current_user_has_permission", { p_permission: "document.archive" });
  return data({ property, documents: documents ?? [], versionMap, signedUrls, profile, canArchive: canArchive === true }, { headers: responseHeaders() });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "document.write");
  const propertyId = params.propertyId;
  const fd = await request.formData();
  const intent = text(fd, "_intent");

  if (intent === "metadata_update") {
    const documentId = text(fd, "document_id");
    const version = Number(text(fd, "version"));
    const title = text(fd, "title");
    const category = text(fd, "category");
    const classification = text(fd, "classification");

    if (!documentId || !Number.isInteger(version) || version < 1) {
      return data<ActionResult>({ error: "Ungültiger Dokumentstand. Bitte Seite neu laden." }, { status: 400, headers: responseHeaders() });
    }
    if (!title) return data<ActionResult>({ error: "Der Dokumenttitel ist erforderlich." }, { status: 400, headers: responseHeaders() });
    if (!CATEGORY_VALUES.has(category as never)) return data<ActionResult>({ error: "Ungültige Dokumentkategorie." }, { status: 400, headers: responseHeaders() });
    if (!CLASSIFICATION_VALUES.has(classification as never)) return data<ActionResult>({ error: "Ungültige Klassifizierung." }, { status: 400, headers: responseHeaders() });

    const { data: updated, error } = await supabase
      .from("documents")
      .update({ title, category, classification, description: text(fd, "description") || null })
      .eq("id", documentId)
      .eq("property_id", propertyId)
      .eq("version", version)
      .select("id")
      .maybeSingle();

    if (error) return data<ActionResult>({ error: "Dokument-Metadaten konnten nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Dokument wurde zwischenzeitlich geändert. Bitte Seite neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(`/properties/${propertyId}/documents`, { headers: responseHeaders() });
  }

  if (intent === "archive") {
    await requirePermission(request, context.cloudflare.env, "document.archive");
    const { data: updated, error } = await supabase.from("documents").update({ archived_at: new Date().toISOString() }).eq("id", text(fd, "document_id")).eq("property_id", propertyId).eq("version", Number(text(fd, "version"))).select("id").maybeSingle();
    if (error) return data<ActionResult>({ error: "Dokument konnte nicht archiviert werden." }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Dokument wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(`/properties/${propertyId}/documents`, { headers: responseHeaders() });
  }

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return data<ActionResult>({ error: "Bitte eine Datei auswählen." }, { status: 400, headers: responseHeaders() });
  if (file.size > MAX_UPLOAD_BYTES) return data<ActionResult>({ error: "Datei ist zu groß. Maximal 25 MB pro Upload." }, { status: 400, headers: responseHeaders() });
  if (!ALLOWED_MIME_TYPES.has(file.type)) return data<ActionResult>({ error: `Dateityp ${file.type || "unbekannt"} ist nicht freigegeben.` }, { status: 400, headers: responseHeaders() });

  const storagePath = `properties/${propertyId}/documents/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const hash = await sha256Hex(file);
  const { error: uploadError } = await supabase.storage.from("zm-private-documents").upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return data<ActionResult>({ error: "Datei konnte nicht in den privaten Storage geladen werden." }, { status: 400, headers: responseHeaders() });

  let registrationError: unknown = null;
  if (intent === "create") {
    const title = text(fd, "title");
    const category = text(fd, "category");
    const classification = text(fd, "classification") || "INTERNAL";
    if (!title || !category) {
      await supabase.storage.from("zm-private-documents").remove([storagePath]);
      return data<ActionResult>({ error: "Titel und Kategorie sind erforderlich." }, { status: 400, headers: responseHeaders() });
    }
    const result = await supabase.rpc("create_property_document_version", {
      p_property_id: propertyId,
      p_category: category,
      p_classification: classification,
      p_title: title,
      p_description: text(fd, "description") || null,
      p_storage_path: storagePath,
      p_original_filename: file.name,
      p_mime_type: file.type,
      p_file_size_bytes: file.size,
      p_sha256: hash,
      p_change_reason: text(fd, "change_reason") || "Initiale Version",
    });
    registrationError = result.error;
  } else if (intent === "new_version") {
    const result = await supabase.rpc("add_property_document_version", {
      p_document_id: text(fd, "document_id"),
      p_storage_path: storagePath,
      p_original_filename: file.name,
      p_mime_type: file.type,
      p_file_size_bytes: file.size,
      p_sha256: hash,
      p_change_reason: text(fd, "change_reason"),
    });
    registrationError = result.error;
  } else {
    registrationError = new Error("unknown intent");
  }

  if (registrationError) {
    await supabase.storage.from("zm-private-documents").remove([storagePath]);
    return data<ActionResult>({ error: "Datei wurde nicht registriert. Der hochgeladene Zwischenstand wurde wieder entfernt." }, { status: 400, headers: responseHeaders() });
  }

  return redirect(`/properties/${propertyId}/documents`, { headers: responseHeaders() });
}

export default function PropertyDocuments() {
  const { property, documents, versionMap, signedUrls, profile, canArchive } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const activeDocument = openIndex === null ? null : documents[openIndex];
  const activeVersions = activeDocument ? (versionMap[activeDocument.id] ?? []) : [];
  const activeVersion = activeDocument ? (activeVersions.find((version) => version.version_number === activeDocument.current_version) ?? activeVersions[0]) : undefined;
  const activeUrl = activeVersion ? signedUrls[activeVersion.id] : undefined;

  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/properties/${property.id}`}>← {property.property_number}</Link><p className="eyebrow">Modul 02 · Dokumente</p><h1 className="editor-title">Dokumente</h1><p className="editor-meta">{property.internal_title} · private Ablage · versioniert</p></div><div className="header-user"><span className="badge">STAGING</span><small>{profile.display_name}</small></div></header>
    {result?.error ? <div className="form-error">{result.error}</div> : null}

    <div className="dashboard-grid">
      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Bestehende Unterlagen</p><h2>Dokumente</h2></div><span className="subtle">{documents.length}</span></div>
        <div className="document-list">
          {documents.map((document, index) => <article className="document-card" id={`document-${document.id}`} key={document.id}>
            <button className="document-preview-trigger" type="button" onClick={() => setOpenIndex(index)}>
              <div className="document-summary-main">
                <strong>{document.title}</strong>
                <small>{categoryLabel(document.category)} · {classificationLabel(document.classification)} · Version {document.current_version}</small>
                {document.description ? <span>{document.description}</span> : null}
              </div>
              <span className="document-edit-hint">Vorschau & Metadaten →</span>
            </button>
          </article>)}
          {documents.length === 0 ? <p className="empty-state">Noch keine Dokumente vorhanden.</p> : null}
        </div>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Neu · max. 25 MB</p><h2>Dokument hochladen</h2></div></div>
        <Form method="post" encType="multipart/form-data" className="auth-form">
          <input type="hidden" name="_intent" value="create"/>
          <label><span>Titel *</span><input name="title" required/></label>
          <label><span>Kategorie *</span><select name="category" defaultValue="OTHER">{CATEGORIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label><span>Klassifizierung *</span><select name="classification" defaultValue="INTERNAL">{CLASSIFICATIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label><span>Beschreibung</span><textarea name="description" rows={3}/></label>
          <label><span>Datei *</span><input name="file" type="file" required/></label>
          <label><span>Änderungsgrund</span><input name="change_reason" defaultValue="Initiale Version"/></label>
          <button className="primary-button" type="submit">Sicher hochladen</button>
        </Form>
      </section>
    </div>

    {activeDocument ? <AssetPreviewModal
      open={true}
      title={activeDocument.title}
      subtitle={`${categoryLabel(activeDocument.category)} · ${classificationLabel(activeDocument.classification)}`}
      url={activeUrl}
      downloadName={activeVersion?.original_filename}
      kind={previewKind(activeVersion?.mime_type)}
      positionLabel={`${(openIndex ?? 0) + 1} von ${documents.length}`}
      hasPrevious={(openIndex ?? 0) > 0}
      hasNext={(openIndex ?? 0) < documents.length - 1}
      onPrevious={() => setOpenIndex((index) => index === null ? 0 : Math.max(0, index - 1))}
      onNext={() => setOpenIndex((index) => index === null ? 0 : Math.min(documents.length - 1, index + 1))}
      onClose={() => setOpenIndex(null)}
      metadata={[
        { label: "Titel", value: activeDocument.title },
        { label: "Kategorie", value: categoryLabel(activeDocument.category) },
        { label: "Klassifizierung", value: classificationLabel(activeDocument.classification) },
        { label: "Beschreibung", value: activeDocument.description || "—" },
        { label: "Aktuelle Version", value: `v${activeDocument.current_version}` },
        { label: "Dateiname", value: activeVersion?.original_filename || "—" },
        { label: "Dateityp", value: activeVersion?.mime_type || "—" },
        { label: "Dateigröße", value: activeVersion ? formatSize(activeVersion.file_size_bytes) : "—" },
        { label: "Hochgeladen", value: activeVersion ? formatDate(activeVersion.uploaded_at) : "—" },
        { label: "SHA-256", value: activeVersion?.sha256 || "—" },
        { label: "Angelegt", value: formatDate(activeDocument.created_at) },
      ]}
      metadataEditor={<Form method="post" className="auth-form">
        <input type="hidden" name="_intent" value="metadata_update"/>
        <input type="hidden" name="document_id" value={activeDocument.id}/>
        <input type="hidden" name="version" value={activeDocument.version}/>
        <label><span>Titel *</span><input name="title" defaultValue={activeDocument.title} required/></label>
        <label><span>Kategorie *</span><select name="category" defaultValue={activeDocument.category}>{CATEGORIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label><span>Klassifizierung *</span><select name="classification" defaultValue={activeDocument.classification}>{CLASSIFICATIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label><span>Beschreibung</span><textarea name="description" rows={3} defaultValue={activeDocument.description ?? ""}/></label>
        <button className="primary-button" type="submit">Metadaten speichern</button>
      </Form>}
      versions={<>
        <div className="version-list">{activeVersions.map((version) => <div className="version-row" key={version.id}><div><strong>v{version.version_number}{version.version_number === activeDocument.current_version ? " · aktuell" : ""}</strong><small>{version.original_filename}</small><small>{formatDate(version.uploaded_at)} · {formatSize(version.file_size_bytes)}</small><small>SHA-256 {version.sha256}</small>{version.change_reason ? <small>{version.change_reason}</small> : null}</div>{signedUrls[version.id] ? <a className="subtle-link" href={signedUrls[version.id]} target="_blank" rel="noreferrer">Öffnen</a> : <span className="subtle">Kein Zugriff</span>}</div>)}</div>
        <Form method="post" encType="multipart/form-data" className="inline-upload"><input type="hidden" name="_intent" value="new_version"/><input type="hidden" name="document_id" value={activeDocument.id}/><label><span>Neue Version</span><input type="file" name="file" required/></label><label><span>Änderungsgrund</span><input name="change_reason" required placeholder="z. B. aktualisierte Unterschrift"/></label><button className="secondary-button" type="submit">Version hochladen</button></Form>
      </>}
      moreActions={canArchive ? <Form method="post" onSubmit={(event) => { if (!window.confirm("Dokument wirklich archivieren?")) event.preventDefault(); }}><input type="hidden" name="_intent" value="archive"/><input type="hidden" name="document_id" value={activeDocument.id}/><input type="hidden" name="version" value={activeDocument.version}/><button className="text-button" type="submit">Dokument archivieren</button></Form> : undefined}
    /> : null}
  </main>;
}
