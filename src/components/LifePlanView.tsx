import { useState } from "react";
import { Save } from "lucide-react";

interface LifePlanViewProps {
  content: string;
  onSave: (content: string) => void;
}

export default function LifePlanView({ content, onSave }: LifePlanViewProps) {
  const [text, setText] = useState(content);
  const [saved, setSaved] = useState(true);

  const handleSave = () => {
    onSave(text);
    setSaved(true);
  };

  return (
    <div className="flex-1 p-6 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Life Plan</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your big picture — values, goals, and direction
          </p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            saved
              ? "text-muted-foreground bg-secondary"
              : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          <Save size={14} />
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        placeholder={`Write your life plan here...\n\nExample sections:\n• My values\n• 1-year goals\n• 5-year vision\n• What I want my days to look like\n• What I'm working toward\n\nThis is your compass. Everything on the task list should eventually connect back to something here.`}
        className="flex-1 bg-card border border-border rounded-lg p-5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none font-body leading-relaxed scrollbar-thin"
      />
    </div>
  );
}
