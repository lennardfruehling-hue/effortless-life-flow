import { Task } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { Check, Pencil, Trash2, MapPin, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { AssigneeAvatar } from "./AssigneePicker";

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

export default function TaskCard({ task, onToggle, onEdit, onDelete }: TaskCardProps) {
  const { byId } = useHouseholdMembers();
  const assignee = byId(task.assigneeId);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`group flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        task.completed
          ? "bg-secondary/50 border-border/50 opacity-60"
          : "bg-card border-border hover:border-primary/30"
      }`}
    >
      <button
        onClick={() => onToggle(task.id)}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          task.completed
            ? "bg-primary border-primary"
            : "border-muted-foreground/40 hover:border-primary"
        }`}
      >
        {task.completed && <Check size={12} className="text-primary-foreground" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {task.categories.map((cat) => (
            <CategoryBadge key={cat} category={cat} small />
          ))}
          {task.dueDate && (() => {
            const today = new Date(); today.setHours(0,0,0,0);
            const due = new Date(task.dueDate);
            const overdue = due < today && !task.completed;
            return (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                <Calendar size={10} /> {task.dueDate}
              </span>
            );
          })()}
          {task.location && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-cat-d">
              <MapPin size={10} /> {task.location}
            </span>
          )}
          {task.hateMagnitude && (
            <span className="text-[10px] text-cat-f font-mono">
              🔥{task.hateMagnitude}/10
            </span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">
            ×{task.categories.length}
          </span>
        </div>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(task)} className="p-1 text-muted-foreground hover:text-foreground">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1 text-muted-foreground hover:text-destructive">
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}
