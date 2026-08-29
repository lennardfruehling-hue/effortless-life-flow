import { useMemo, useState } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  AlertTriangle,
  Timer,
  PieChart,
  Target,
  Plus,
  Trash2,
  Lightbulb,
} from "lucide-react";

export interface FinanceAccount {
  id: string;
  name: string;
  balance: number;
  isDebt?: boolean;
  included?: boolean;
}

export interface FinanceGoal {
  id: string;
  name: string;
  saved: number;
  target: number;
}

export interface SpendingCategory {
  id: string;
  name: string;
  amount: number;
}

export interface FinanceState {
  monthlyIncome: number;
  monthlyExpenses: number;
  accounts: FinanceAccount[];
  goals: FinanceGoal[];
  spending?: SpendingCategory[];
}

/** Seeded from the Wealth Command Centre snapshot. */
export const DEFAULT_FINANCE: FinanceState = {
  monthlyIncome: 4201,
  monthlyExpenses: 3657,
  accounts: [
    { id: "cash", name: "Cash on Hand", balance: 0, included: true },
    { id: "revolut", name: "Revolut", balance: 0, included: true },
    { id: "ccu", name: "Capital Credit Union", balance: 10, included: true },
    { id: "bank-austria", name: "Bank Austria", balance: -3660, isDebt: true, included: true },
  ],
  goals: [
    { id: "emergency", name: "Emergency Fund", saved: 0, target: 10000 },
    { id: "peru", name: "Peru Trip (Feb 2027)", saved: 0, target: 1300 },
  ],
  spending: [
    { id: "housing", name: "Housing", amount: 2050 },
    { id: "debts", name: "Debts", amount: 431 },
    { id: "savings", name: "Savings", amount: 260 },
    { id: "other", name: "Other", amount: 250 },
    { id: "food", name: "Food", amount: 220 },
    { id: "personal", name: "Personal", amount: 170 },
    { id: "transport", name: "Transport", amount: 86 },
    { id: "utilities", name: "Utilities", amount: 76 },
  ],
};

const eur = (n: number) =>
  `${n < 0 ? "-" : ""}€${Math.abs(n).toLocaleString("en-IE", { maximumFractionDigits: 0 })}`;

type SectionKey = "health" | "tips" | "spending" | "accounts" | "goals";

export default function FinanceSummaryCard() {
  const [finance, setFinance] = useCloudState<FinanceState>(CLOUD_KEYS.finance, DEFAULT_FINANCE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    health: true,
    tips: true,
    spending: false,
    accounts: false,
    goals: false,
  });

  const data = finance ?? DEFAULT_FINANCE;
  const spending = data.spending ?? [];

  const toggleSection = (k: SectionKey) => setSections((s) => ({ ...s, [k]: !s[k] }));

  const { netBalance, assets, debts, savings, savingsRate, runway, warnings, tips } = useMemo(() => {
    const included = (data.accounts || []).filter((a) => a.included !== false);
    const assets = included.filter((a) => !a.isDebt).reduce((s, a) => s + (a.balance || 0), 0);
    const debts = included.filter((a) => a.isDebt).reduce((s, a) => s + (a.balance || 0), 0);
    const income = data.monthlyIncome || 0;
    const expenses = data.monthlyExpenses || 0;
    const savings = income - expenses;
    const netBalance = assets + debts;
    const savingsRate = income ? Math.round((savings / income) * 100) : 0;
    const runway = expenses > 0 ? Math.max(0, assets) / expenses : 0;

    const warnings: { id: string; text: string; tone: "danger" | "warn" }[] = [];
    if (netBalance < 0)
      warnings.push({ id: "net", text: `Net balance is negative (${eur(netBalance)})`, tone: "danger" });
    if (expenses > income)
      warnings.push({
        id: "burn",
        text: `Expenses exceed income by ${eur(expenses - income)} per month`,
        tone: "danger",
      });
    if (runway < 3)
      warnings.push({
        id: "runway",
        text: `Runway of ${runway.toFixed(1)} months — under 3 months of expenses covered`,
        tone: "danger",
      });
    if (savingsRate < 20 && savingsRate >= 0)
      warnings.push({ id: "rate", text: `Savings rate ${savingsRate}% — below the 20% target`, tone: "warn" });
    if (debts < 0)
      warnings.push({ id: "debt", text: `Outstanding debts of ${eur(Math.abs(debts))}`, tone: "warn" });
    for (const g of data.goals || []) {
      if (g.target > 0 && g.saved <= 0)
        warnings.push({ id: `goal-${g.id}`, text: `${g.name} has no progress yet`, tone: "warn" });
    }
    // ---- Top financial tips (prioritised advice from the Wealth Command Centre) ----
    const cats = [...(data.spending || [])].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    const biggest = cats[0];
    const housing = cats.find((c) => /housing|rent|mortgage/i.test(c.name));
    const housingShare = income ? Math.round(((housing?.amount || 0) / income) * 100) : 0;
    const tips: { id: string; text: string }[] = [];
    if (debts < 0)
      tips.push({
        id: "t-debt",
        text: `Clear the ${eur(Math.abs(debts))} debt first — set a fixed monthly payment before any discretionary spending.`,
      });
    if (runway < 3)
      tips.push({
        id: "t-buffer",
        text: `Build a starter buffer of ${eur(Math.round(expenses))} (one month of expenses) before funding long-term goals.`,
      });
    if (housing && housingShare > 30)
      tips.push({
        id: "t-housing",
        text: `Housing takes ${housingShare}% of income — the healthy ceiling is 30%. Renegotiate, share, or relocate to free up ${eur(Math.max(0, (housing.amount || 0) - income * 0.3))}/mo.`,
      });
    if (savingsRate < 20)
      tips.push({
        id: "t-rate",
        text: `Automate a transfer on payday to lift the savings rate from ${savingsRate}% toward 20% — pay yourself before spending.`,
      });
    if (expenses > income)
      tips.push({
        id: "t-burn",
        text: `You spend ${eur(expenses - income)} more than you earn each month — cut the two largest variable categories or add income to close the gap.`,
      });
    if (biggest && biggest !== housing)
      tips.push({
        id: "t-biggest",
        text: `${biggest.name} is your largest controllable cost (${eur(biggest.amount || 0)}) — a 15% trim frees ${eur(Math.round((biggest.amount || 0) * 0.15))}/mo.`,
      });
    tips.push({
      id: "t-goals",
      text: "Give each savings goal its own monthly amount and date so progress is measurable, not aspirational.",
    });

    return { netBalance, assets, debts, savings, savingsRate, runway, warnings, tips: tips.slice(0, 6) };
  }, [data]);

  const spendTotal = spending.reduce((s, c) => s + (c.amount || 0), 0);

  const patch = (p: Partial<FinanceState>) => setFinance({ ...data, ...p });

  const toggleAccount = (id: string) =>
    patch({
      accounts: data.accounts.map((a) => (a.id === id ? { ...a, included: a.included === false } : a)),
    });

  return (
    <section className="mb-5 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Wallet size={15} className="text-primary" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground leading-none">Wealth Command Centre</h3>
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <span className={`ml-auto text-sm font-semibold ${netBalance < 0 ? "text-destructive" : "text-foreground"}`}>
          {eur(netBalance)}
        </span>
        <button
          onClick={() => setOpen(!open)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={open ? "Collapse finances" : "Expand finances"}
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-border">
        <Kpi
          icon={<Wallet size={12} />}
          label="Net today"
          value={eur(netBalance)}
          tone={netBalance < 0 ? "text-destructive" : "text-foreground"}
        />
        <Kpi icon={<TrendingUp size={12} />} label="Income (mo)" value={eur(data.monthlyIncome)} tone="text-emerald-600" />
        <Kpi icon={<TrendingDown size={12} />} label="Expenses (mo)" value={eur(data.monthlyExpenses)} tone="text-destructive" />
        <Kpi
          icon={<PiggyBank size={12} />}
          label="Savings"
          value={eur(savings)}
          hint={`${savingsRate}% rate`}
          tone={savings < 0 ? "text-destructive" : "text-foreground"}
        />
        <Kpi
          icon={<Timer size={12} />}
          label="Runway"
          value={`${runway.toFixed(1)} mo`}
          hint="expenses covered"
          tone={runway < 3 ? "text-destructive" : "text-foreground"}
        />
        <Kpi icon={<Wallet size={12} />} label="Assets" value={eur(assets)} hint={`${eur(debts)} debts`} />
      </div>

      {open && (
        <div className="p-4 space-y-3 border-t border-border">
          {/* Monthly figures */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Monthly figures</span>
            <button
              onClick={() => setEditing(!editing)}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {editing ? <Check size={12} /> : <Pencil size={12} />} {editing ? "Done" : "Edit"}
            </button>
          </div>
          {editing && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">
                Income
                <input
                  type="number"
                  value={data.monthlyIncome}
                  onChange={(e) => patch({ monthlyIncome: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Expenses
                <input
                  type="number"
                  value={data.monthlyExpenses}
                  onChange={(e) => patch({ monthlyExpenses: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            </div>
          )}

          {/* Financial health / warnings */}
          <Section
            open={sections.health}
            onToggle={() => toggleSection("health")}
            icon={<AlertTriangle size={12} />}
            title="Financial health"
            badge={warnings.length ? `${warnings.length}` : "OK"}
            badgeTone={warnings.length ? "text-destructive" : "text-emerald-600"}
          >
            {warnings.length === 0 ? (
              <p className="text-xs text-muted-foreground">No warnings — finances look stable.</p>
            ) : (
              <ul className="space-y-1.5">
                {warnings.map((w) => (
                  <li
                    key={w.id}
                    className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                      w.tone === "danger"
                        ? "border-destructive/30 bg-destructive/5 text-destructive"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>{w.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Top financial tips */}
          <Section
            open={sections.tips}
            onToggle={() => toggleSection("tips")}
            icon={<Lightbulb size={12} />}
            title="Top financial tips"
            badge={`${tips.length}`}
            badgeTone="text-primary"
          >
            <ol className="space-y-1.5">
              {tips.map((t, i) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-xs text-foreground"
                >
                  <span className="font-mono text-[10px] text-primary mt-0.5 shrink-0">{i + 1}.</span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ol>
          </Section>



          {/* Spending breakdown */}
          <Section
            open={sections.spending}
            onToggle={() => toggleSection("spending")}
            icon={<PieChart size={12} />}
            title="Monthly spending breakdown"
            badge={eur(spendTotal)}
          >
            <div className="space-y-2">
              {spending
                .slice()
                .sort((a, b) => b.amount - a.amount)
                .map((c) => {
                  const pct = spendTotal > 0 ? Math.round((c.amount / spendTotal) * 100) : 0;
                  return (
                    <div key={c.id}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-foreground">{c.name}</span>
                        <span className="text-muted-foreground font-mono">
                          {eur(c.amount)} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              {spending.length === 0 && <p className="text-xs text-muted-foreground">No categories yet.</p>}
            </div>
          </Section>


          {/* Accounts */}
          <Section
            open={sections.accounts}
            onToggle={() => toggleSection("accounts")}
            icon={<Wallet size={12} />}
            title="Accounts"
            badge={eur(netBalance)}
            badgeTone={netBalance < 0 ? "text-destructive" : undefined}
          >
            <p className="text-[11px] text-muted-foreground mb-1.5">tap to include / exclude from balance</p>
            <div className="space-y-1">
              {data.accounts.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAccount(a.id)}
                    className={`flex-1 flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                      a.included === false
                        ? "border-border text-muted-foreground opacity-60"
                        : "border-border text-foreground hover:border-primary/30"
                    }`}
                  >
                    <span className="truncate">{a.name}</span>
                    <span className={a.balance < 0 ? "text-destructive font-medium" : "font-medium"}>
                      {eur(a.balance)}
                    </span>
                  </button>
                  {editing && (
                    <input
                      type="number"
                      value={a.balance}
                      onChange={(e) =>
                        patch({
                          accounts: data.accounts.map((x) =>
                            x.id === a.id ? { ...x, balance: Number(e.target.value) } : x
                          ),
                        })
                      }
                      className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    />
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Goals */}
          <Section
            open={sections.goals}
            onToggle={() => toggleSection("goals")}
            icon={<Target size={12} />}
            title="Savings goals"
            badge={`${data.goals.length}`}
          >
            <div className="space-y-2">
              {data.goals.map((g) => {
                const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
                return (
                  <div key={g.id}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-foreground">{g.name}</span>
                      <span className="text-muted-foreground font-mono">
                        {eur(g.saved)} / {eur(g.target)} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    {editing && (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          value={g.saved}
                          onChange={(e) =>
                            patch({
                              goals: data.goals.map((x) =>
                                x.id === g.id ? { ...x, saved: Number(e.target.value) } : x
                              ),
                            })
                          }
                          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                        />
                        <button
                          onClick={() => patch({ goals: data.goals.filter((x) => x.id !== g.id) })}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${g.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      )}
    </section>
  );
}

function Section({
  open,
  onToggle,
  icon,
  title,
  badge,
  badgeTone = "text-muted-foreground",
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeTone?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-medium text-foreground">{title}</span>
        {badge && <span className={`ml-auto text-xs font-mono ${badgeTone}`}>{badge}</span>}
        {open ? (
          <ChevronUp size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-border">{children}</div>}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = "text-foreground",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`text-sm font-semibold mt-0.5 ${tone}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
