import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
- {"type":"navigate","view":"tasks"|"lifeplan"|"consistency"|"research"|"lists"|"calendar"|"reminders"}

Rules:
- Emit an empty actions array when the user only asks a question; answer in "speak".
- Never invent ids; match existing items by their id from the state snapshot when possible.
- Keep "speak" natural and short — it is read aloud.
- Today's date is provided in the state snapshot; resolve relative dates yourself.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages.slice(-24) : [];
    const state = typeof body?.state === "string" ? body.state.slice(0, 20000) : "";
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${SYSTEM}\n\nAPP STATE (json):\n${state}` },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("voice gateway error", res.status, text);
      const status = res.status === 429 || res.status === 402 ? res.status : 500;
      return new Response(JSON.stringify({ error: `AI error ${res.status}` }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { speak: String(raw), actions: [] };
    }
    return new Response(
      JSON.stringify({ speak: parsed.speak ?? "", actions: Array.isArray(parsed.actions) ? parsed.actions : [] }),
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
