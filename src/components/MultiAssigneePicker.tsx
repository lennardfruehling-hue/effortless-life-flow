import { useEffect, useRef, useState } from "react";
import { MemberProfile } from "@/hooks/useHouseholdMembers";
import { AssigneeAvatar } from "./AssigneePicker";
import { Check, Users } from "lucide-react";

interface Props {
  members: MemberProfile[];
  value?: string[] | null;
  onChange: (ids: string[]) => void;
  size?: "sm" | "md";
  label?: string;
}

/**
 * Pop-over picker that lets the user assign one OR many household members
 * to whatever entity it's attached to (task, list, note, project task, etc.).
 */
export default function MultiAssigneePicker({ members, value, onChange, size = "sm", label }: Props) {
  const ids = value || [];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = (id: string) => {
    if (ids.includes(id)) onChange(ids.filter((x) => x !== id));
    else onChange([...ids, id]);
  };

  const stackPx = size === "md" ? 18 : 12;
  return (
    <div className="relative inline-flex items-center gap-1.5" ref={ref}>
      {label && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center hover:opacity-90"
        title="Assign household members"
      >
        {ids.length === 0 ? (
          <span className={`${size === "md" ? "w-7 h-7 text-[11px]" : "w-5 h-5 text-[9px]"} rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground/60`}>
            <Users size={size === "md" ? 12 : 9} />
          </span>
        ) : (
          <span className="flex items-center" style={{ paddingRight: ids.length > 1 ? (ids.length - 1) * stackPx : 0 }}>
            {ids.map((id, i) => {
              const m = members.find((x) => x.user_id === id);
              return (
                <span
                  key={id}
                  style={{ marginLeft: i === 0 ? 0 : -stackPx, zIndex: ids.length - i }}
                  className="ring-1 ring-background rounded-full"
                >
                  <AssigneeAvatar member={m || null} size={size} />
                </span>
              );
            })}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 min-w-[180px] bg-popover border border-border rounded-md shadow-lg py-1">
          {members.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">No household members yet</div>
          )}
          {members.map((m) => {
            const sel = ids.includes(m.user_id);
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={() => toggle(m.user_id)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs hover:bg-secondary/60"
              >
                <AssigneeAvatar member={m} size="sm" />
                <span className="flex-1 text-foreground truncate">{m.display_name || "Member"}</span>
                {sel && <Check size={12} className="text-primary" />}
              </button>
            );
          })}
          {ids.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="block w-full text-left px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-destructive border-t border-border mt-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Read-only stacked display of assigned members. */
export function AssigneeStack({ ids, members, size = "sm" }: { ids?: string[] | null; members: MemberProfile[]; size?: "sm" | "md" }) {
  const list = ids || [];
  if (list.length === 0) return null;
  const stackPx = size === "md" ? 18 : 12;
  return (
    <span className="inline-flex items-center" style={{ paddingRight: list.length > 1 ? (list.length - 1) * stackPx : 0 }}>
      {list.map((id, i) => {
        const m = members.find((x) => x.user_id === id);
        return (
          <span
            key={id}
            style={{ marginLeft: i === 0 ? 0 : -stackPx, zIndex: list.length - i }}
            className="ring-1 ring-background rounded-full"
          >
            <AssigneeAvatar member={m || null} size={size} />
          </span>
        );
      })}
    </span>
  );
}
