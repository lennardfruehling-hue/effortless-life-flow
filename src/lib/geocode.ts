// Lightweight address search powered by OpenStreetMap Nominatim (free, no API key).
// Used for the task location autocomplete + map preview.

export interface PlaceSuggestion {
  display: string;
  lat: number;
  lon: number;
  osmId: string;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${ENDPOINT}?format=json&addressdetails=0&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    signal,
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Geocode failed (${res.status})`);
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    osm_type: string;
    osm_id: number;
  }>;
  return data.map((d) => ({
    display: d.display_name,
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
    osmId: `${d.osm_type}-${d.osm_id}`,
  }));
}

/** OpenStreetMap embed URL for a small static-style map iframe (no API key). */
export function osmEmbedUrl(lat: number, lon: number, zoom = 15): string {
  const d = 0.01; // bounding box ~1km
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

export function osmLinkUrl(lat: number, lon: number, zoom = 17): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}
