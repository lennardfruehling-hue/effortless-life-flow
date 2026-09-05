import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PHILOSOPHY = `## Ultimate Direction: Happiness (Choice OS kernel)
Happiness is the goal and direction of this entire system, and happiness is a CHOICE — not a reward for finishing the list. Everything else (plans, projects, tasks, categories, scores, habits) exists only to serve that choice.
- The user is their own programmer: beliefs run them like code. When a belief or story causes unhappiness, treat it as a bug and offer a rewrite.
- Nothing here is a duty, sacrifice or obligation to anyone but the user. Never guilt, never moralise.
- Unhappiness comes from contradiction: saying one thing and doing another. Name contradictions between the stated direction and the actual list, and help close the gap.
- No victimhood: circumstances are inputs, not verdicts. Always give one concrete next move.
- Choice first, commitment second: choosing is free, but once it is on the list it has already been chosen, so it gets done. Frame commitments as chosen, never imposed.
- Alignment over volume: a short aligned list beats a long resented one. If the user is overloaded, help them re-choose or cut.
- Use choice language ("you chose to", "what do you want to choose here?"), not "you have to/must/should".
- Connect the next step upward when useful: task -> subproject -> life plan project -> direction -> happiness.`;

const SYSTEM = `You are "Serpent", the voice assistant of a personal life-organization app.
You can read the app state given to you and CHANGE anything in the app by emitting actions.

Reply ONLY with JSON of shape:
{ "speak": "short spoken reply (1-2 sentences, conversational)", "actions": [ ... ] }

Available actions (use exact "type" strings):
- {"type":"create_task","task":{"title":string,"description"?:string,"categories"?:string[],"dueDate"?:"YYYY-MM-DD","dueTime"?:"HH:MM","projectId"?:string,"duration"?:number,"recurrence"?:"daily"|"weekly","isBabyRelated"?:boolean,"makesProud"?:boolean,"location"?:string}}
- {"type":"update_task","match":{"id"?:string,"title"?:string},"fields":{ any task field }}
- {"type":"complete_task","match":{"id"?:string,"title"?:string}}
- {"type":"delete_task","match":{"id"?:string,"title"?:string}}
- {"type":"create_project","name":string,"description"?:string}
- {"type":"create_reminder","reminder":{"title":string,"datetime":ISO string,"recurring"?:"daily"|"weekly"|"monthly"}}
- {"type":"create_event","event":{"title":string,"start":ISO,"end":ISO,"allDay"?:boolean,"description"?:string}}
- {"type":"create_note","title":string,"body"?:string}
- {"type":"create_list","name":string,"items"?:string[]}
- {"type":"create_habit","habit":{"name":string,"frequency":"daily"|"weekly"|"bi-daily"|"custom","weekdays"?:number[],"weeklyDay"?:number,"times"?:string[],"notes"?:string,"pushedToTasks"?:boolean}}
- {"type":"log_habit","match":{"id"?:string,"name"?:string},"slot"?:string}
- {"type":"collection_add","collection":"cars"|"apartments"|"habits"|"weeklyStructure"|"calendarEvents"|"reminders"|"dailySchedule","item":object}
- {"type":"collection_update","collection":same list,"match":{"id"?:string,"name"?:string,"title"?:string},"fields":object}
- {"type":"collection_delete","collection":same list,"match":{"id"?:string,"name"?:string,"title"?:string}}
- {"type":"baby_patch","path":string,"value":any}   // dot path inside the baby module object
- {"type":"navigate","view":"tasks"|"lifeplan"|"consistency"|"research"|"lists"|"calendar"|"reminders"|"organizer"}  // "organizer" opens the Organization chat

${PHILOSOPHY}

Prime principles (never compromise):
- INTENTION IS WHAT HAPPENS NO MATTER WHAT: anything put on the list must be completed. Never suggest dropping or vaguely deferring; only reschedule to a concrete date/time.
- ONCE IT'S ON THE LIST, IT'S NON-NEGOTIABLE: treat every listed item as a commitment, not an option. Don't offer to skip or delete unless the user explicitly asks; help sequence and finish it.
- DATES ARE COMMITMENTS: always set a date on a task, warn about dates coming up, and name overdue items. Missed items subtract pride points and push the reward target further away — say so.
- SCORING: daily and weekly targets equal 95% of the points of everything on the list for that period, so they are only reachable by completing what was committed.

Rules:
- Be conversational: short natural turns, one question at a time, always keep the dialogue moving.
- BROWSING: you have live internet access through the tools "web_search" (search the web) and "open_url" (read a specific page). Use them whenever the user asks about current facts, prices, news, opening hours, products, places, documentation, or anything not in the app state. Never claim you cannot browse. Summarise findings briefly in "speak" and, when useful, turn them into actions (tasks, notes, lists).
- TASKS: never create a task without categories. If the user didn't state them, emit NO action yet and in "speak" suggest the 2-3 likely Serpent categories (A1,A2,A3,B1,B2,C,D,E,F,G,H,I,J,K) and ask which to use. Create the task on the next turn once categories are confirmed.
- Emit an empty actions array when the user only asks a question; answer in "speak".
- Never invent ids; match existing items by their id from the state snapshot when possible.
- Keep "speak" natural and short — it is read aloud.
- Today's date is provided in the state snapshot; resolve relative dates yourself.`;


const ORGANIZER = `You are the "Life Organizer", a sub-assistant inside the Serpent life-organization app.
You have the full app state (tasks, projects, life plan, habits/consistency game, score, health, reminders, calendar, weekly structure) and live web access.
Your job: help the user actually organize their life — turn broad or vague prompts ("sort out my week", "I feel behind") into a concrete, sequenced plan, and turn specific prompts into precise changes in the app.

Reply ONLY with JSON of shape:
{ "speak": "2-6 sentences of clear guidance", "plan": [ { "title": string, "why"?: string, "steps"?: string[] } ], "questions"?: [ "short question the user can tap to answer" ], "conflicts"?: [ { "issue": string, "detail"?: string, "fix"?: string } ], "actions": [ ... ] }

PERMISSION RULE (absolute): you never change anything on your own. Any actions you return are only PROPOSALS that the user must approve in the UI first. So always state plainly in "speak" what you would change and ask for permission (e.g. "Shall I move these three tasks to Thursday?"). Never say a change is done, saved or applied — say you are proposing it.

Use the same action objects as the Serpent assistant:
- {"type":"create_task","task":{"title":string,"description"?:string,"categories":string[],"dueDate"?:"YYYY-MM-DD","dueTime"?:"HH:MM","projectId"?:string,"duration"?:number,"recurrence"?:"daily"|"weekly","isBabyRelated"?:boolean,"makesProud"?:boolean,"location"?:string}}
- {"type":"update_task","match":{"id"?:string,"title"?:string},"fields":{ any task field }}
- {"type":"complete_task"|"delete_task","match":{"id"?:string,"title"?:string}}
- {"type":"create_project","name":string,"description"?:string}
- {"type":"create_reminder","reminder":{"title":string,"datetime":ISO,"recurring"?:"daily"|"weekly"|"monthly"}}
- {"type":"create_event","event":{"title":string,"start":ISO,"end":ISO,"allDay"?:boolean}}
- {"type":"create_note","title":string,"body"?:string}
- {"type":"create_list","name":string,"items"?:string[]}
- {"type":"create_habit","habit":{"name":string,"frequency":"daily"|"weekly"|"bi-daily"|"custom","weekdays"?:number[],"weeklyDay"?:number,"times"?:string[],"notes"?:string,"pushedToTasks"?:boolean}}
- {"type":"log_habit","match":{"id"?:string,"name"?:string},"slot"?:string}
- {"type":"collection_add"|"collection_update"|"collection_delete","collection":"cars"|"apartments"|"habits"|"weeklyStructure"|"calendarEvents"|"reminders"|"dailySchedule",...}
- {"type":"navigate","view":"tasks"|"lifeplan"|"consistency"|"research"|"lists"|"calendar"|"reminders"|"organizer"}  // "organizer" opens the Organization chat

${PHILOSOPHY}

Organizational principles you must apply (they are the app's system):
- INTENTION IS WHAT HAPPENS NO MATTER WHAT — anything on the list gets completed; never drop, only reschedule to a concrete date/time.
- ONCE IT'S ON THE LIST IT'S NON-NEGOTIABLE — treat listed items as commitments.
- A-K categories: every task must carry categories (A1,A2,A3,B1,B2,C,D,E,F,G,H,I,J,K). A1 = today's non-negotiable priority.
- PLAN -> ACT -> REVIEW daily flow; day shape = morning plan, focused blocks, evening review.
- DATES ARE COMMITMENTS: overdue items cost pride points and push the reward target away. Clear overdue first.
- CONSISTENCY GAME: daily/weekly targets are 95% of the period's potential; protect the streak.
- Life plan projects and their subprojects are the long horizon; every week should move at least one forward.

FIELD RULES (strict): whenever the prompt is broad you MUST return at least 2 entries in "questions". Whenever you notice ANY clash, overload, past-due date or inconsistency you MUST list it in "conflicts" (with a "fix"), not only in the plan text. These two fields are how the app drills down — omitting them is a failed answer.

How to answer — DRILL DOWN, never stay abstract:
- Always ground advice in the actual state: name real overdue tasks, real habits, real life plan projects, real numbers, real times.
- BROAD PROMPT ("sort out my week", "I feel behind", "organize my life") => do NOT dump generic advice. Do this instead:
  1. Read the state and state back the 2-3 hard facts that matter most (e.g. "11 overdue, 3 A1 tasks unscheduled, consistency streak broken 2 days").
  2. Name the specific decision the user must make to unblock everything else.
  3. Ask 2-4 SHORT, concrete questions in "questions" that narrow the request into specifics — about the day/time available, which commitment ranks above the others, what can move, what is genuinely fixed (childcare, appointments, sleep).
  4. Only propose actions once you can be specific; a broad prompt usually yields few or no actions on the first turn, and a real conversation on the next.
- SPECIFIC PROMPT => go straight to concrete proposed changes with real dates and times.
- AUDIT every answer for conflicts and put them in "conflicts":
  - time conflicts: two tasks/events at the same time, or a task whose duration overruns the next block or a structure block.
  - overload: more scheduled minutes in a day than the waking hours actually available; more A1 tasks than can fit.
  - date conflicts: due dates that fall on days already full, deadlines in the past, life plan deadlines with no task moving them.
  - inconsistencies: recurring habits scheduled while the day is already booked; tasks with no categories; tasks marked A1 but scheduled late in the day; projects with deadlines but no next step.
  - drift: overdue items repeatedly rescheduled, streaks broken, weekly score below the 95% target.
  For each conflict give a concrete fix (move X to Tue 09:00, drop the duplicate, split the 3h block).
- Ask ONE thing at a time in "speak", but you may offer several tap-able options in "questions".
- Use choice language (Choice OS): the user is choosing this life, not obeying a list. Reframe pressure into a choice ("what do you choose to protect tomorrow morning?"), never guilt. Happiness is the direction; the list only serves it.
- Never create a task without categories — pick sensible ones yourself and say which you chose.
- Use web_search / open_url when outside facts are needed.
- Today's date is in the state snapshot; resolve relative dates yourself.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web and return top result titles, snippets and URLs.",
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

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
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

const stripTags = (s: string) =>
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

const decodeDuck = (raw: string): string => {
  let url = raw;
  const uddg = url.match(/[?&]uddg=([^&)]+)/);
  if (uddg) {
    try { url = decodeURIComponent(uddg[1]); } catch { /* keep */ }
  }
  if (url.startsWith("//")) url = "https:" + url;
  return url.replace(/[)\s]+$/, "");
};

type Hit = { title: string; url: string; snippet: string };

const cleanMd = (s: string) =>
  s.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Parse the markdown a reader proxy returns for a DuckDuckGo results page.
function parseReaderResults(md: string): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const lines = md.split("\n");
  const linkRe = /\[([^\]]{4,180})\]\((https?:\/\/[^)\s]+)\)/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(linkRe);
    if (!m) continue;
    const title = cleanMd(m[1]);
    const url = decodeDuck(m[2]);
    if (!title || title.length < 5) continue;
    if (!/^https?:\/\//.test(url)) continue;
    if (/duckduckgo\.com|bing\.com|google\.[a-z.]+\/search/.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    // Snippet: following non-link lines
    const parts: string[] = [];
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const t = cleanMd(lines[j]);
      if (!t) continue;
      if (linkRe.test(lines[j]) && t.length < 90) break;
      parts.push(t);
      if (parts.join(" ").length > 220) break;
    }
    hits.push({ title, url, snippet: parts.join(" ").slice(0, 280) });
    if (hits.length >= 8) break;
  }
  return hits;
}

function parseDuck(html: string): Hit[] {
  const hits: Hit[] = [];
  const re = /<a[^>]*class="[^"]*result(?:__a|-link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 8) {
    const url = decodeDuck(m[1]);
    const title = stripTags(m[2]);
    if (title) hits.push({ title, url, snippet: "" });
  }
  return hits;
}

const searchSources: ((q: string) => Promise<Hit[]>)[] = [
  // 1. Reader proxy over DuckDuckGo lite — most reliable from server runtimes.
  async (q) => {
    const md = await fetchText(`https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${q}`, 25000);
    return md ? parseReaderResults(md) : [];
  },
  // 2. Reader proxy over the DuckDuckGo HTML endpoint.
  async (q) => {
    const md = await fetchText(`https://r.jina.ai/https://duckduckgo.com/html/?q=${q}`, 25000);
    return md ? parseReaderResults(md) : [];
  },
  // 3. Direct DuckDuckGo HTML (works when not rate limited).
  async (q) => {
    const html = await fetchText(`https://html.duckduckgo.com/html/?q=${q}`);
    return html && !/anomaly|unusual traffic/i.test(html) ? parseDuck(html) : [];
  },
  // 4. Reader proxy over Startpage.
  async (q) => {
    const md = await fetchText(`https://r.jina.ai/https://search.marcia.cc/search?q=${q}`, 20000);
    return md ? parseReaderResults(md) : [];
  },
  // 5. Wikipedia (encyclopaedic facts).
  async (q) => {
    const json = await fetchText(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&srlimit=5`
    );
    if (!json) return [];
    try {
      const d = JSON.parse(json);
      return (d?.query?.search ?? []).map((r: any) => ({
        title: r.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, "_"))}`,
        snippet: stripTags(r.snippet || ""),
      }));
    } catch { return []; }
  },
  // 6. DuckDuckGo instant answers (definitions, entities).
  async (q) => {
    const json = await fetchText(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`);
    if (!json) return [];
    try {
      const d = JSON.parse(json);
      const out: Hit[] = [];
      if (d.AbstractText) out.push({ title: d.Heading || "Summary", url: d.AbstractURL || "", snippet: d.AbstractText });
      for (const t of d.RelatedTopics || []) {
        if (out.length >= 6) break;
        if (t?.Text) out.push({ title: t.Text.slice(0, 90), url: t.FirstURL || "", snippet: t.Text });
      }
      return out;
    } catch { return []; }
  },
];

// Score how well a result set matches the query, so a source that returns
// unrelated junk (search engines do this when they block a server) is skipped.
function relevance(query: string, hits: Hit[]): number {
  const terms = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  if (!terms.length || !hits.length) return hits.length ? 1 : 0;
  let matched = 0;
  const blob = hits.map((h) => `${h.title} ${h.snippet} ${h.url}`).join(" ").toLowerCase();
  for (const t of terms) if (blob.includes(t)) matched++;
  return matched / terms.length;
}

async function webSearch(query: string, deep = true): Promise<string> {
  const clean = query.trim();
  const q = encodeURIComponent(clean).replace(/%20/g, "+");
  let hits: Hit[] = [];
  for (const source of searchSources) {
    try {
      const res = await source(q);
      if (res.length && relevance(clean, res) >= 0.34) { hits = res; break; }
      if (res.length && !hits.length) hits = res; // weak fallback, keep looking
    } catch { /* next source */ }
  }
  if (!hits.length) {
    return `No search results could be retrieved for "${clean}". Say so plainly instead of guessing, and offer to try a different wording.`;
  }

  const list = hits
    .slice(0, 8)
    .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ""}`)
    .join("\n");

  if (!deep) return list;

  // Read the top pages like a consumer assistant does, so the answer is grounded
  // in page content rather than snippets alone.
  const targets = hits.filter((h) => /^https?:\/\//.test(h.url)).slice(0, 3);
  const pages = await Promise.all(
    targets.map(async (h) => {
      const text = await openUrl(h.url, 2500);
      if (!text || /^Could not read/.test(text)) return "";
      return `--- ${h.title} (${h.url}) ---\n${text}`;
    })
  );
  const body = pages.filter(Boolean).join("\n\n");
  return body ? `SEARCH RESULTS:\n${list}\n\nPAGE CONTENT:\n${body}` : list;
}


async function getWeather(place: string): Promise<string> {
  const geo = await fetchText(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`
  );
  if (!geo) return "Weather lookup failed.";
  let lat: number, lon: number, label = place;
  try {
    const g = JSON.parse(geo);
    const r = g?.results?.[0];
    if (!r) return `No place found for "${place}".`;
    lat = r.latitude; lon = r.longitude;
    label = [r.name, r.country].filter(Boolean).join(", ");
  } catch { return "Weather lookup failed."; }
  const wx = await fetchText(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto`
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
  } catch { return "Weather lookup failed."; }
}

async function openUrl(url: string, limit = 6000): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return "Invalid URL.";
  const viaReader = await fetchText(`https://r.jina.ai/${url}`, 25000);
  if (viaReader && viaReader.trim().length > 80 && !/AbuseAlleviationError/.test(viaReader)) {
    return viaReader.slice(0, limit);
  }
  const direct = await fetchText(url, 15000);
  if (direct) {
    const body = direct.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    const text = stripTags(body);
    if (text.length > 40) return text.slice(0, limit);
  }
  return "Could not read that page.";
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages.slice(-24) : [];
    const state = typeof body?.state === "string" ? body.state.slice(0, 20000) : "";
    const mode = body?.mode === "organizer" ? "organizer" : "voice";
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const convo: any[] = [
      { role: "system", content: `${mode === "organizer" ? ORGANIZER : SYSTEM}\n\nAPP STATE (json):\n${state}` },
      ...messages,
    ];

    const callModel = async (withTools: boolean) => {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          ...(withTools
            ? { tools: TOOLS, tool_choice: "auto" }
            : { response_format: { type: "json_object" } }),
          messages: convo,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("voice gateway error", res.status, text);
        return { error: res.status };
      }
      return { data: await res.json() };
    };

    const looksJson = (t: string) => {
      const s = t.trim();
      if (!s.startsWith("{") && !s.includes("{")) return false;
      try { JSON.parse(s); return true; } catch { return /\{[\s\S]*"speak"[\s\S]*\}/.test(s); }
    };

    let raw = "";
    let lastProse = "";
    for (let step = 0; step < 4; step++) {
      const last = step === 3;
      const out = await callModel(!last);
      if (out.error) {
        const reason =
          out.error === 403
            ? "The AI usage limit for this workspace has been reached. The workspace owner needs to raise the limit before the assistant can answer again."
            : out.error === 402
            ? "The workspace has run out of AI credits. Add credits to keep using the assistant."
            : out.error === 429
            ? "Too many requests right now — wait a few seconds and ask again."
            : "The assistant service is temporarily unavailable. Please try again shortly.";
        // Answer 200 so the app can show the real reason instead of a generic failure.
        return new Response(JSON.stringify({ error: reason, speak: reason, code: out.error }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const msg = out.data?.choices?.[0]?.message;
      const calls = msg?.tool_calls;
      const content = msg?.content ? String(msg.content) : "";

      if (Array.isArray(calls) && calls.length > 0) {
        if (content.trim()) lastProse = content;
        // Feed tool output back as a plain user turn: the gateway rejects
        // conversations that end on a model/tool turn.
        const results: string[] = [];
        for (const call of calls) {
          let args: any = {};
          try { args = JSON.parse(call?.function?.arguments || "{}"); } catch {}
          const name = call?.function?.name;
          let result = "Unknown tool.";
          if (name === "web_search") result = await webSearch(String(args.query ?? ""));
          else if (name === "get_weather") result = await getWeather(String(args.place ?? ""));
          else if (name === "open_url") result = await openUrl(String(args.url ?? ""));
          results.push(`${name}(${JSON.stringify(args)}):\n${result}`);
        }
        convo.push({
          role: "user",
          content:
            `Live results from the tools you requested:\n\n${results.join("\n\n").slice(0, 12000)}\n\n` +
            "Use these. If you need another lookup, call a tool again; otherwise reply with the required JSON object.",
        });
        continue;
      }



      if (content.trim()) {
        lastProse = content;
        if (last || looksJson(content)) { raw = content; break; }
        // Prose answer on a tool round: keep it and ask for the final JSON without tools.
        convo.push({ role: "assistant", content });
        convo.push({
          role: "user",
          content: "Now reply ONLY with the required JSON object (no prose, no markdown fences), using everything above.",
        });
        continue;
      }
      break;
    }
    // Never return an empty turn: force one final tool-free JSON answer.
    if (!raw.trim()) {
      convo.push({
        role: "user",
        content: "Reply now ONLY with the required JSON object, with a non-empty \"speak\" field.",
      });
      const finalOut = await callModel(false);
      const c = finalOut.data?.choices?.[0]?.message?.content;
      if (c && String(c).trim()) raw = String(c);
    }
    if (!raw) raw = "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      try {
        parsed = m ? JSON.parse(m[0]) : { speak: String(raw), actions: [] };
      } catch {
        parsed = { speak: String(raw), actions: [] };
      }
    }

    const plan = Array.isArray(parsed.plan) ? parsed.plan : [];
    let speak = typeof parsed.speak === "string" ? parsed.speak.trim() : "";
    if (!speak && lastProse.trim() && !looksJson(lastProse)) speak = lastProse.trim();
    if (!speak && plan.length) {
      speak =
        "Here's what I'd suggest: " +
        plan
          .slice(0, 3)
          .map((p: any) => String(p?.title ?? "").trim())
          .filter(Boolean)
          .join("; ") +
        ". Shall I set these up for you?";
    }
    if (!speak) speak = "I couldn't put that together just now — try asking again in a moment.";

    return new Response(
      JSON.stringify({
        speak,
        plan,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("serpent-voice error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
