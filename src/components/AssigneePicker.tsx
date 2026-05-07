import { MemberProfile } from "@/hooks/useHouseholdMembers";

interface Props {
  members: MemberProfile[];
  value?: string | null;
  onChange: (id: string | null) => void;
  size?: "sm" | "md";
  label?: string;
}

function initials(name: string | null | undefined, fallback = "?") {
  const n = (name || "").trim();
  if (!n) return fallback;
  return n.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

export function AssigneeAvatar({ member, size = "sm" }: { member?: MemberProfile | null; size?: "sm" | "md" }) {
  const px = size === "md" ? "w-7 h-7 text-[11px]" : "w-5 h-5 text-[9px]";
  if (!member) {
    return (
      <span className={`${px} rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground/60`}>·</span>
    );
  }
  return (
    <span
      className={`${px} rounded-full flex items-center justify-center font-semibold text-white shadow-sm`}
      style={{ background: member.color }}
      title={member.display_name || "Member"}
    >
      {initials(member.display_name)}
    </span>
  );
}

export default function AssigneePicker({ members, value, onChange, size = "sm", label }: Props) {
  const current = members.find(m => m.user_id === value) || null;
  return (
    <div className="inline-flex items-center gap-1.5">
      {label && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>}
      <div className="relative inline-flex">
        <AssigneeAvatar member={current} size={size} />
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          title="Assign to household member"
        >
          <option value="">Unassigned</option>
          {members.map(m => (
            <option key={m.user_id} value={m.user_id}>{m.display_name || "Member"}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
