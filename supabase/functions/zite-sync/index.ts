import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_ZITE_URL = "https://45qzpzd743.zite.so";
const FINANCE_KEY = "serpent-finance";
const CONFIG_KEY = "serpent-zite";

type Json = Record<string, any>;

function monthlyEquivalent(e: Json, now: Date): number {
  const amt = Number(e.amount) || 0;
  const type = String(e.expenseType || e.frequency || "Monthly").toLowerCase();
  if (type.includes("year")) return amt / 12;
  if (type.includes("week")) return amt * 4.333;
  if (type.includes("fortnight") || type.includes("bi-week")) return amt * 2.167;
  if (type.includes("quarter")) return amt / 3;
  if (type.includes("one")) {
    const d = e.dueDate ? new Date(e.dueDate) : null;
    if (d && d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth()) return amt;
    return 0;
  }
  return amt;
}

function monthLabel(d: Date) {
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${String(d.getUTCFullYear()).slice(2)}`;
}

function slug(s: string, i: number) {
  return (String(s || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item") + "-" + i;
}

/** Map the Zite budget payload into the app's FinanceState shape. */
export function mapZite(all: Json, insights: Json | null, now = new Date()) {
  const cash = Number(all?.settings?.cashOnHand) || 0;
  const accounts = [
    ...(cash ? [{ id: "cash", name: "Cash on Hand", balance: cash, included: true }] : []),
    ...((all.bankAccounts || []) as Json[]).map((a, i) => ({
      id: slug(a.accountName, i),
      name: String(a.accountName || "Account"),
      balance: Number(a.balance) || 0,
      isDebt: (Number(a.balance) || 0) < 0,
      included: true,
    })),
  ];

  const label = monthLabel(now);
  const cf = ((all.cashFlow || []) as Json[]).find((m) => String(m.month) === label);
  const monthlyExpensesFromList = ((all.expenses || []) as Json[]).reduce((s, e) => s + monthlyEquivalent(e, now), 0);
  const monthlyIncome = Math.round(Number(cf?.income) || 0);
  const monthlyExpenses = Math.round(Number(cf?.expenses) || monthlyExpensesFromList);

  const byCat = new Map<string, number>();
  for (const e of (all.expenses || []) as Json[]) {
    const v = monthlyEquivalent(e, now);
    if (v <= 0) continue;
    const c = String(e.category || "Other");
    byCat.set(c, (byCat.get(c) || 0) + v);
  }
  const spending = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount], i) => ({ id: slug(name, i), name, amount: Math.round(amount) }));

  const goals = ((all.savingsGoals || []) as Json[])
    .filter((g) => String(g.goalName || "").trim())
    .map((g, i) => ({
      id: slug(g.goalName, i),
      name: String(g.goalName),
      saved: Number(g.currentAmount) || 0,
      target: Number(g.targetAmount) || 0,
    }));

  return {
    monthlyIncome,
    monthlyExpenses,
    accounts,
    goals,
    spending,
    source: "zite" as const,
    syncedAt: new Date().toISOString(),
    healthScore: insights?.healthScore ?? null,
    healthLabel: insights?.healthLabel ?? null,
    ziteWarnings: Array.isArray(insights?.warnings)
      ? insights!.warnings.slice(0, 6).map((w: Json, i: number) => ({
          id: `zite-${i}`,
          severity: String(w.severity || "warning"),
          title: String(w.title || ""),
          detail: String(w.detail || ""),
        }))
      : [],
  };
}

async function fetchZite(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  const post = async (path: string) => {
    const r = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!r.ok) throw new Error(`${path} returned ${r.status}`);
    return await r.json();
  };
  const all = await post("/api/getAll");
  let insights: Json | null = null;
  try {
    insights = await post("/api/dashboardInsights");
  } catch (_) {
    insights = null;
  }
  return { all, insights };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const cron = body?.cron === true || req.headers.get("x-zite-cron") === "1";

    // Which users to sync
    let targets: { userId: string; url: string }[] = [];

    if (cron) {
      const { data } = await admin.from("user_data").select("user_id, value").eq("key", CONFIG_KEY);
      targets = (data || [])
        .filter((r: Json) => (r.value as Json)?.enabled !== false)
        .map((r: Json) => ({
          userId: r.user_id as string,
          url: String((r.value as Json)?.url || DEFAULT_ZITE_URL),
        }));
    } else {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      const { data: userRes } = await admin.auth.getUser(token);
      const user = userRes?.user;
      if (!user) return json({ error: "Not signed in" }, 401);
      const url = String(body?.url || "").trim() || DEFAULT_ZITE_URL;
      targets = [{ userId: user.id, url }];
      await admin.from("user_data").upsert(
        {
          user_id: user.id,
          key: CONFIG_KEY,
          value: { url, enabled: true, lastSync: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,key" }
      );
    }

    if (targets.length === 0) return json({ ok: true, synced: 0, message: "No Zite connections configured" });

    const results: Json[] = [];
    for (const t of targets) {
      try {
        const { all, insights } = await fetchZite(t.url);
        const finance = mapZite(all, insights);
        await admin.from("user_data").upsert(
          {
            user_id: t.userId,
            key: FINANCE_KEY,
            value: finance,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,key" }
        );
        results.push({ userId: t.userId, ok: true, finance: cron ? undefined : finance });
      } catch (e) {
        console.error("zite sync failed", t.userId, e);
        results.push({ userId: t.userId, ok: false, error: String((e as Error).message || e) });
      }
    }

    const first = results[0];
    if (!cron && first && !first.ok) return json({ error: `Could not read the Zite page: ${first.error}` }, 200);

    return json({ ok: true, synced: results.filter((r) => r.ok).length, results });
  } catch (e) {
    console.error("zite-sync error", e);
    return json({ error: String((e as Error).message || e) }, 200);
  }
});
