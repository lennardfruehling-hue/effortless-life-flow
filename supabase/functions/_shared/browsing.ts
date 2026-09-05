/** Shared live-browsing tools for the Serpent assistants. */

export async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function webSearch(query: string): Promise<string> {
  const q = encodeURIComponent(String(query || "").trim()).replace(/%20/g, "+");
  if (!q) return "Empty query.";

  const attempts: (() => Promise<string[]>)[] = [
    // Bing RSS — reliable from server runtimes
    async () => {
      const xml = await fetchText(`https://www.bing.com/search?q=${q}&format=rss`);
      if (!xml) return [];
      const out: string[] = [];
      for (const it of xml.split("<item>").slice(1, 8)) {
        const title = stripTags((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
        const link = stripTags((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
        const desc = stripTags((it.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "");
        if (title) out.push(`${title}\n   ${desc}\n   ${link}`);
      }
      return out;
    },
    // DuckDuckGo HTML
    async () => {
      const html = await fetchText(`https://html.duckduckgo.com/html/?q=${q}`);
      if (!html) return [];
      const out: string[] = [];
      const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && out.length < 6) {
        let url = m[1];
        const uddg = url.match(/uddg=([^&]+)/);
        if (uddg) url = decodeURIComponent(uddg[1]);
        if (url.startsWith("//")) url = "https:" + url;
        const title = stripTags(m[2]);
        if (title) out.push(`${title}\n   ${url}`);
      }
      return out;
    },
    // DuckDuckGo instant answers
    async () => {
      const json = await fetchText(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`);
      if (!json) return [];
      try {
        const d = JSON.parse(json);
        const out: string[] = [];
        if (d.AbstractText) out.push(`${d.Heading || query}: ${d.AbstractText}\n   ${d.AbstractURL || ""}`);
        for (const t of d.RelatedTopics || []) {
          if (out.length >= 6) break;
          if (t?.Text) out.push(`${t.Text}\n   ${t.FirstURL || ""}`);
        }
        return out;
      } catch {
        return [];
      }
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (res.length) return res.map((r, i) => `${i + 1}. ${r}`).join("\n");
    } catch {
      // next source
    }
  }
  return "No results found from any search source. Say so plainly instead of guessing.";
}

export async function openUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return "Invalid URL.";
  const viaReader = await fetchText(`https://r.jina.ai/${url}`, 20000);
  if (viaReader && viaReader.trim().length > 80) return viaReader.slice(0, 6000);
  const direct = await fetchText(url, 15000);
  if (direct) {
    const body = direct.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    const text = stripTags(body);
    if (text.length > 40) return text.slice(0, 6000);
  }
  return "Could not read that page.";
}

export async function getWeather(place: string): Promise<string> {
  const geo = await fetchText(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`
  );
  if (!geo) return "Weather lookup failed.";
  let lat: number, lon: number, label = place;
  try {
    const r = JSON.parse(geo)?.results?.[0];
    if (!r) return `No place found for "${place}".`;
    lat = r.latitude;
    lon = r.longitude;
    label = [r.name, r.country].filter(Boolean).join(", ");
  } catch {
    return "Weather lookup failed.";
  }
  const wx = await fetchText(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto`
  );
  if (!wx) return "Weather lookup failed.";
  try {
    const d = JSON.parse(wx);
    const c = d.current || {};
    const day = d.daily || {};
    const lines = [
      `${label}: now ${c.temperature_2m}°C (feels ${c.apparent_temperature}°C), wind ${c.wind_speed_10m} km/h, precipitation ${c.precipitation} mm.`,
    ];
    for (let i = 0; i < (day.time?.length ?? 0); i++) {
      lines.push(
        `${day.time[i]}: ${day.temperature_2m_min[i]}–${day.temperature_2m_max[i]}°C, rain chance ${day.precipitation_probability_max?.[i] ?? "?"}%.`
      );
    }
    return lines.join("\n");
  } catch {
    return "Weather lookup failed.";
  }
}

export const BROWSE_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web for current information. Returns titles, snippets and URLs.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Current weather and 3-day forecast for a place name (live, reliable).",
      parameters: {
        type: "object",
        properties: { place: { type: "string", description: "City or place name" } },
        required: ["place"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_url",
      description: "Fetch a web page and return its readable text content.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute http(s) URL" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
];

export async function runBrowseTool(name: string, args: any): Promise<string> {
  if (name === "web_search") return await webSearch(String(args?.query ?? ""));
  if (name === "get_weather") return await getWeather(String(args?.place ?? ""));
  if (name === "open_url") return await openUrl(String(args?.url ?? ""));
  return "Unknown tool.";
}
