import { useMemo, useState } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, ChevronDown, ChevronUp, Pencil, Check } from "lucide-react";

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

export interface FinanceState {
  monthlyIncome: number;
  monthlyExpenses: number;
  accounts: FinanceAccount[];
  goals: FinanceGoal[];
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
};

const eur = (n: number) =>
  `${n < 0 ? "-" : ""}€${Math.abs(n).toLocaleString("en-IE", { maximumFractionDigits: 0 })}`;

export default function FinanceSummaryCard() {
  const [finance, setFinance] = useCloudState<FinanceState>(CLOUD_KEYS.finance, DEFAULT_FINANCE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const data = finance ?? DEFAULT_FINANCE;

  const { netBalance, assets, debts, savings, savingsRate } = useMemo(() => {
    const included = (data.accounts || []).filter((a) => a.included !== false);
    const assets = included.filter((a) => !a.isDebt).reduce((s, a) => s + (a.balance || 0), 0);
    const debts = included.filter((a) => a.isDebt).reduce((s, a) => s + (a.balance || 0), 0);
    const savings = (data.monthlyIncome || 0) - (data.monthlyExpenses || 0);
    return {
      assets,
      debts,
      netBalance: assets + debts,
      savings,
      savingsRate: data.monthlyIncome ? Math.round((savings / data.monthlyIncome) * 100) : 0,
    };
  }, [data]);

  const patch = (p: Partial<FinanceState>) => setFinance({ ...data, ...p });

  const toggleAccount = (id: string) =>
    patch({
      accounts: data.accounts.map((a) => (a.id === id ? { ...a, included: a.included === false } : a)),
    });

  return (
    <section className="mb-5 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Wallet size={15} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Wealth Command Centre</h3>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        <Kpi icon={<TrendingUp size={12} />} label="Income" value={eur(data.monthlyIncome)} tone="text-emerald-600" />
        <Kpi icon={<TrendingDown size={12} />} label="Expenses" value={eur(data.monthlyExpenses)} tone="text-destructive" />
        <Kpi
          icon={<PiggyBank size={12} />}
          label="Savings"
          value={eur(savings)}
          hint={`${savingsRate}% rate`}
          tone={savings < 0 ? "text-destructive" : "text-foreground"}
        />
        <Kpi icon={<Wallet size={12} />} label="Assets" value={eur(assets)} hint={`${eur(debts)} debts`} />
      </div>

      {open && (
        <div className="p-4 space-y-4 border-t border-border">
          {/* Monthly figures */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Monthly</span>
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

          {/* Accounts */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Accounts <span className="normal-case tracking-normal">· tap to include in balance</span>
            </p>
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
          </div>

          {/* Goals */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Savings goals</p>
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
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
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
