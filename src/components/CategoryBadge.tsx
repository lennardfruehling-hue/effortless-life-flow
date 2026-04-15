import { Category, CATEGORY_META } from "@/lib/types";

const colorMap: Record<string, string> = {
  "cat-a": "bg-cat-a/20 text-cat-a border-cat-a/30",
  "cat-b": "bg-cat-b/20 text-cat-b border-cat-b/30",
  "cat-c": "bg-cat-c/20 text-cat-c border-cat-c/30",
  "cat-d": "bg-cat-d/20 text-cat-d border-cat-d/30",
  "cat-e": "bg-cat-e/20 text-cat-e border-cat-e/30",
  "cat-f": "bg-cat-f/20 text-cat-f border-cat-f/30",
  "cat-g": "bg-cat-g/20 text-cat-g border-cat-g/30",
  "cat-h": "bg-cat-h/20 text-cat-h border-cat-h/30",
  "cat-i": "bg-cat-i/20 text-cat-i border-cat-i/30",
  "cat-j": "bg-cat-j/20 text-cat-j border-cat-j/30",
};

function getColorClass(cat: Category): string {
  const meta = CATEGORY_META[cat];
  return colorMap[meta.color] || "";
}

export function CategoryBadge({ category, small }: { category: Category; small?: boolean }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-flex items-center border rounded-sm font-mono font-medium ${getColorClass(category)} ${
        small ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"
      }`}
    >
      {meta.label}
    </span>
  );
}

export function CategoryBadgeFull({ category }: { category: Category }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-sm text-xs px-2 py-0.5 font-mono ${getColorClass(category)}`}
    >
      {meta.label}
    </span>
  );
}
