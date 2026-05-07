import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, title, datetime } = await req.json();
    if (!email || !title) {
      return new Response(JSON.stringify({ error: "Missing email or title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Forward to the Lovable Emails transactional sender if it's configured.
    // If it's not configured yet we surface a soft error so the alarm still fires.
    const idemp = `reminder-${email}-${datetime}`;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateName: "reminder-notification",
        recipientEmail: email,
        idempotencyKey: idemp,
        templateData: { title, datetime },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn("send-transactional-email failed:", resp.status, text);
      return new Response(JSON.stringify({ ok: false, reason: "email_not_configured", detail: text }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reminder-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
