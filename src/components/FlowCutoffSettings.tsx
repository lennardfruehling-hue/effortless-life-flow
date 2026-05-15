import { useState } from "react";
import { X, Clock } from "lucide-react";
import { FlowCutoffs, loadCutoffs, saveCutoffs, DEFAULT_CUTOFFS, loadPhaseToggleVisible, savePhaseToggleVisible } from "@/lib/flowSettings";

export default function FlowCutoffSettings({ onClose }: { onClose: () => void }) {
  const [cutoffs, setCutoffs] = useState<FlowCutoffs>(() => loadCutoffs());

  const update = (k: keyof FlowCutoffs, v: string) =>
    setCutoffs((prev) => ({ ...prev, [k]: v }));

  const handleSave = () => {
    saveCutoffs(cutoffs);
    onClose();
  };

  const handleReset = () => setCutoffs({ ...DEFAULT_CUTOFFS });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock size={18} /> Serpent Flow Times
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Set the time of day by which each flow check must be completed. Past these times the toolbar will alarm.
        </p>

        {([
          { key: "start", label: "Start Serpent — completed by", hint: "Plan the day before this time." },
          { key: "midday", label: "Midday Check — completed by", hint: "Mid-day review of A1 progress." },
          { key: "evening", label: "Evening Review — completed by", hint: "End-of-day reflection." },
        ] as const).map((row) => (
          <div key={row.key}>
            <label className="text-sm text-foreground mb-1 block">{row.label}</label>
            <input
              type="time"
              value={cutoffs[row.key]}
              onChange={(e) => update(row.key, e.target.value)}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{row.hint}</p>
          </div>
        ))}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Save
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset defaults
          </button>
        </div>
      </div>
    </div>
  );
}
