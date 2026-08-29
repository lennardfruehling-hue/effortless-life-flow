/** Dashboard bar settings (location for weather). */

export interface DashboardLocation {
  /** Human label shown in the bar, e.g. "Dublin". */
  name: string;
  lat: number;
  lon: number;
}

const KEY = "serpent-dashboard-location";
const EVENT = "serpent-dashboard-location-changed";

export const DEFAULT_LOCATION: DashboardLocation = { name: "Dublin", lat: 53.3498, lon: -6.2603 };

export function loadLocation(): DashboardLocation {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LOCATION };
    const v = JSON.parse(raw);
    if (v && typeof v.name === "string" && typeof v.lat === "number" && typeof v.lon === "number") return v;
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LOCATION };
}

export function saveLocation(loc: DashboardLocation) {
  localStorage.setItem(KEY, JSON.stringify(loc));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: loc }));
}

export function onLocationChange(cb: (loc: DashboardLocation) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail as DashboardLocation);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Look up a place by name (Open-Meteo geocoding, no API key). */
export async function geocode(query: string): Promise<DashboardLocation | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(query)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.results?.[0];
  if (!hit) return null;
  return {
    name: [hit.name, hit.country_code].filter(Boolean).join(", "),
    lat: hit.latitude,
    lon: hit.longitude,
  };
}

/* ---------------- Weather ---------------- */

export interface Weather {
  tempC: number;
  code: number;
  label: string;
  emoji: string;
}

const WEATHER_CODES: Record<number, [string, string]> = {
  0: ["Clear", "☀️"],
  1: ["Mostly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Drizzle", "🌦️"],
  55: ["Heavy drizzle", "🌦️"],
  61: ["Light rain", "🌧️"],
  63: ["Rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  71: ["Light snow", "🌨️"],
  73: ["Snow", "🌨️"],
  75: ["Heavy snow", "❄️"],
  80: ["Showers", "🌦️"],
  81: ["Showers", "🌦️"],
  82: ["Heavy showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm", "⛈️"],
  99: ["Thunderstorm", "⛈️"],
};

export async function fetchWeather(loc: DashboardLocation): Promise<Weather | null> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const cur = data?.current;
  if (!cur) return null;
  const code = Number(cur.weather_code ?? 0);
  const [label, emoji] = WEATHER_CODES[code] || ["—", "🌡️"];
  return { tempC: Math.round(Number(cur.temperature_2m)), code, label, emoji };
}
