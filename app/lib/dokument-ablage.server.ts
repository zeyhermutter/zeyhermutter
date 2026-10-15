// Dateien in die Dokumentenablage einer Immobilie laden (15.10.2026).
//
// Herausgeloest aus routes/property-documents.tsx, damit die Unterlagenliste
// dieselben Regeln benutzt: dieselben Dateitypen, dieselbe Groesse, derselbe
// private Speicher, dieselbe Pruefsumme und dieselben Datenbankfunktionen.
// Scheitert die Registrierung, wird die hochgeladene Datei wieder entfernt.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set([
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
export const SPEICHER = "zm-private-documents";

export function safeFilename(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned.slice(-140) || "datei";
}

export async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Prueft die Datei; null heisst in Ordnung, sonst die Meldung. */
export function dateiFehler(file: unknown): string | null {
  if (!(file instanceof File) || file.size === 0) return "Bitte eine Datei auswählen.";
  if (file.size > MAX_UPLOAD_BYTES) return "Datei ist zu groß. Maximal 25 MB pro Upload.";
  if (!ALLOWED_MIME_TYPES.has(file.type)) return `Dateityp ${file.type || "unbekannt"} ist nicht freigegeben.`;
  return null;
}

type Ergebnis = { dokumentId: string } | { fehler: string };

/**
 * Laedt die Datei hoch und legt ein neues Dokument an -- oder, mit
 * `zuDokument`, eine neue Fassung eines vorhandenen.
 */
export async function dateiInAblage(supabase: any, propertyId: string, file: File, angaben: {
  zuDokument?: string | null;
  titel: string;
  kategorie: string;
  klassifizierung?: string;
  beschreibung?: string | null;
  grund?: string | null;
}): Promise<Ergebnis> {
  const fehler = dateiFehler(file);
  if (fehler) return { fehler };
  const pfad = `properties/${propertyId}/documents/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const hash = await sha256Hex(file);
  const { error: uploadError } = await supabase.storage.from(SPEICHER).upload(pfad, file, { contentType: file.type, upsert: false });
  if (uploadError) return { fehler: "Die Datei konnte nicht gespeichert werden." };

  const gemeinsam = { p_storage_path: pfad, p_original_filename: file.name, p_mime_type: file.type, p_file_size_bytes: file.size, p_sha256: hash };
  const { data, error } = angaben.zuDokument
    ? await supabase.rpc("add_property_document_version", { p_document_id: angaben.zuDokument, ...gemeinsam, p_change_reason: angaben.grund || "Neue Fassung" })
    : await supabase.rpc("create_property_document_version", {
      p_property_id: propertyId, p_category: angaben.kategorie, p_classification: angaben.klassifizierung || "INTERNAL",
      p_title: angaben.titel, p_description: angaben.beschreibung || null, ...gemeinsam, p_change_reason: angaben.grund || "Initiale Version",
    });
  if (error) {
    await supabase.storage.from(SPEICHER).remove([pfad]);
    return { fehler: "Die Datei wurde nicht übernommen. Der hochgeladene Zwischenstand wurde wieder entfernt." };
  }
  return { dokumentId: angaben.zuDokument ?? String(data) };
}
