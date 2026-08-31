import type { SupabaseClient } from "@supabase/supabase-js";

export type PropertyAddressInput = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  district?: string | null;
  country?: string | null;
};

export type SearchLocationInput = {
  postalCode?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
};

export type GeocodedCoordinates = {
  latitude: number;
  longitude: number;
  source: "cache" | "nominatim";
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const APP_URL = "https://zeyhermutter.playsony.workers.dev/";
const APP_USER_AGENT = `ZeyherMutterOS/0.1 (+${APP_URL})`;

function wait(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function reserveSlot(supabase: SupabaseClient) {
  const { data: waitMs, error } = await supabase.rpc("reserve_nominatim_slot");
  if (error) throw new Error("Geokodierungs-Slot konnte nicht reserviert werden.");
  await wait(Number(waitMs ?? 0));
}

async function fetchFirstCoordinates(params: URLSearchParams): Promise<GeocodedCoordinates | null> {
  params.set("countrycodes", params.get("countrycodes") || "de");
  params.set("format", "jsonv2");
  params.set("limit", "1");
  params.set("addressdetails", "0");
  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { Accept: "application/json", "Accept-Language": "de", Referer: APP_URL, "User-Agent": APP_USER_AGENT },
  });
  if (!response.ok) throw new Error(`Nominatim antwortete mit HTTP ${response.status}.`);
  const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const first = results[0];
  if (!first?.lat || !first?.lon) return null;
  const latitude = Number(first.lat), longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, source: "nominatim" };
}

export async function geocodePropertyAddress(
  supabase: SupabaseClient,
  address: PropertyAddressInput,
): Promise<GeocodedCoordinates | null> {
  const country = (address.country || "DE").toUpperCase();
  const { data: cached, error: cacheError } = await supabase
    .from("property_addresses")
    .select("latitude, longitude")
    .eq("street", address.street)
    .eq("house_number", address.houseNumber)
    .eq("postal_code", address.postalCode)
    .eq("city", address.city)
    .eq("country", country)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(1)
    .maybeSingle();
  if (!cacheError && cached?.latitude != null && cached?.longitude != null) {
    return { latitude: Number(cached.latitude), longitude: Number(cached.longitude), source: "cache" };
  }
  await reserveSlot(supabase);
  const params = new URLSearchParams({
    street: `${address.houseNumber} ${address.street}`,
    postalcode: address.postalCode,
    city: address.city,
    countrycodes: country.toLowerCase(),
    layer: "address",
  });
  return fetchFirstCoordinates(params);
}

export async function geocodeSearchLocation(
  supabase: SupabaseClient,
  location: SearchLocationInput,
): Promise<GeocodedCoordinates | null> {
  const postalCode = location.postalCode?.trim() || "";
  const city = location.city?.trim() || "";
  const district = location.district?.trim() || "";
  if (!postalCode && !city) return null;

  let cached = supabase
    .from("search_profile_locations")
    .select("latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(1);
  if (postalCode) cached = cached.eq("postal_code", postalCode);
  if (city) cached = cached.ilike("city", city);
  if (district) cached = cached.ilike("district", district);
  const { data: cachedRow, error: cacheError } = await cached.maybeSingle();
  if (!cacheError && cachedRow?.latitude != null && cachedRow?.longitude != null) {
    return { latitude: Number(cachedRow.latitude), longitude: Number(cachedRow.longitude), source: "cache" };
  }

  await reserveSlot(supabase);
  const params = new URLSearchParams({ countrycodes: (location.country || "DE").toLowerCase(), layer: "address" });
  if (postalCode) params.set("postalcode", postalCode);
  if (city) params.set("city", city);
  if (district) params.set("q", [district, city, postalCode].filter(Boolean).join(", "));
  return fetchFirstCoordinates(params);
}
