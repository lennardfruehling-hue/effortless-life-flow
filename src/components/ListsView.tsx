import { useState, useEffect, useCallback, useMemo } from "react";
import { TaskList, ListItem, Task, Project } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuid } from "uuid";
import { Plus, Trash2, ListChecks, CheckSquare, Square, Link2, Loader2, X, Search, ListTodo } from "lucide-react";
import TagPicker, { TagChips } from "./TagPicker";
import { Project } from "@/lib/types";

interface Props {
  tasks: Task[];
  onSaveTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projects?: Project[];
}

export default function ListsView({ tasks, onSaveTasks, projects = [] }: Props) {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [linkPickerFor, setLinkPickerFor] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    const { data } = await supabase.from("task_lists").select("*").order("created_at", { ascending: false });
    if (data) setLists(data as TaskList[]);
    setLoading(false);
  }, []);

  const loadItems = useCallback(async (listId: string) => {
    const { data } = await supabase.from("list_items").select("*").eq("list_id", listId).order("position");
    if (data) setItems(data as ListItem[]);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);
  useEffect(() => {
    const handler = () => { loadLists(); if (activeId) loadItems(activeId); };
    window.addEventListener("lists-updated", handler);
    return () => window.removeEventListener("lists-updated", handler);
  }, [loadLists, loadItems, activeId]);

  useEffect(() => {
    if (activeId) loadItems(activeId); else setItems([]);
  }, [activeId, loadItems]);

  const active = lists.find(l => l.id === activeId);

  const createList = async () => {
    const name = prompt("List name", "New List");
    if (!name) return;
    const { data } = await supabase.from("task_lists").insert({ name }).select().single();
    if (data) { await loadLists(); setActiveId(data.id); }
  };

  const deleteList = async (id: string) => {
    if (!confirm("Delete this list?")) return;
    await supabase.from("task_lists").delete().eq("id", id);
    if (activeId === id) setActiveId(null);
    loadLists();
  };

  const addItem = async (alsoCreateTask = false) => {
    if (!activeId || !newItem.trim()) return;
    const content = newItem.trim();
    let linkedTaskId: string | null = null;
    if (alsoCreateTask) {
      const newTask: Task = {
        id: uuid(),
        title: content,
        categories: ["A3"],
        completed: false,
        createdAt: new Date().toISOString(),
      };
      onSaveTasks(prev => [...prev, newTask]);
      linkedTaskId = newTask.id;
    }
    await supabase.from("list_items").insert({
      list_id: activeId,
      content,
      position: items.length,
      linked_task_id: linkedTaskId,
    });
    setNewItem("");
    loadItems(activeId);
  };

  const toggleItem = async (item: ListItem) => {
    const next = !item.checked;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: next } : i));
    await supabase.from("list_items").update({ checked: next }).eq("id", item.id);
    // mirror to linked task
    if (item.linked_task_id) {
      onSaveTasks(prev => prev.map(t => t.id === item.linked_task_id
        ? { ...t, completed: next, completedAt: next ? new Date().toISOString() : undefined }
        : t));
    }
  };

  const deleteItem = async (id: string) => {
    await supabase.from("list_items").delete().eq("id", id);
    if (activeId) loadItems(activeId);
  };

  const linkToTask = async (itemId: string, taskId: string) => {
    await supabase.from("list_items").update({ linked_task_id: taskId }).eq("id", itemId);
    setLinkPickerFor(null);
    if (activeId) loadItems(activeId);
  };

  const unlink = async (itemId: string) => {
    await supabase.from("list_items").update({ linked_task_id: null }).eq("id", itemId);
    if (activeId) loadItems(activeId);
  };

  return (
    <div className="flex-1 flex h-screen overflow-hidden">
      {/* List sidebar */}
      <div className="w-64 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ListChecks size={18} className="text-primary" /> Lists
          </h2>
          <button onClick={createList} className="bg-primary text-primary-foreground p-1.5 rounded hover:opacity-90">
            <Plus size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {loading ? (
            <div className="flex justify-center p-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
          ) : lists.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No lists yet.<br />Try: "packing list", "shopping list"...
            </p>
          ) : lists.map(list => {
            return (
              <button
                key={list.id}
                onClick={() => setActiveId(list.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm group flex items-center gap-2 transition-colors ${
                  activeId === list.id ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary"
                }`}
              >
                <span>{list.icon || "📋"}</span>
                <span className="truncate flex-1">{list.name}</span>
                <Trash2
                  size={12}
                  onClick={(e) => { e.stopPropagation(); deleteList(list.id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!active ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <ListChecks size={56} className="text-primary/20 mb-4" />
            <p className="text-muted-foreground">Select a list or create a new one</p>
            <p className="text-xs text-muted-foreground mt-1">Travel packing · shopping · checklists</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-8 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{active.icon || "📋"}</span>
              <input
                value={active.name}
                onChange={async (e) => {
                  const name = e.target.value;
                  setLists(prev => prev.map(l => l.id === active.id ? { ...l, name } : l));
                  await supabase.from("task_lists").update({ name }).eq("id", active.id);
                }}
                className="flex-1 bg-transparent text-2xl font-bold text-foreground focus:outline-none"
              />
              <span className="text-xs text-muted-foreground font-mono">
                {items.filter(i => i.checked).length}/{items.length}
              </span>
            </div>

            {/* Items */}
            <div className="space-y-1">
              {items.map(item => {
                const linkedTask = tasks.find(t => t.id === item.linked_task_id);
                return (
                  <div key={item.id} className="group flex items-start gap-2 py-1.5 px-2 hover:bg-secondary/50 rounded">
                    <button onClick={() => toggleItem(item)} className="text-primary mt-0.5">
                      {item.checked ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <input
                        value={item.content}
                        onChange={async (e) => {
                          const v = e.target.value;
                          setItems(prev => prev.map(i => i.id === item.id ? { ...i, content: v } : i));
                          await supabase.from("list_items").update({ content: v }).eq("id", item.id);
                        }}
                        className={`w-full bg-transparent text-sm focus:outline-none ${item.checked ? "line-through text-muted-foreground" : "text-foreground"}`}
                      />
                      {linkedTask && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-primary">
                          <Link2 size={10} /> Linked to task: {linkedTask.title}
                          <button onClick={() => unlink(item.id)} className="hover:text-destructive ml-1"><X size={10} /></button>
                        </div>
                      )}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                      {!linkedTask && (
                        <button
                          onClick={() => setLinkPickerFor(linkPickerFor === item.id ? null : item.id)}
                          className="text-muted-foreground hover:text-primary p-1"
                          title="Link to task"
                        >
                          <Link2 size={12} />
                        </button>
                      )}
                      <button onClick={() => deleteItem(item.id)} className="text-muted-foreground hover:text-destructive p-1">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Link picker (search) */}
              {linkPickerFor && (
                <LinkPicker
                  tasks={tasks}
                  onPick={(taskId) => linkToTask(linkPickerFor, taskId)}
                  onClose={() => setLinkPickerFor(null)}
                />
              )}
            </div>

            {/* Add item — also offers "Add as task" */}
            <div className="flex gap-2 pt-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem(false)}
                placeholder="Add an item…  (Shift-click ✓ to also create a task)"
                className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => addItem(false)}
                disabled={!newItem.trim()}
                title="Add list item"
                className="bg-primary text-primary-foreground px-3 rounded hover:opacity-90 disabled:opacity-30"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => addItem(true)}
                disabled={!newItem.trim()}
                title="Add list item AND create a task"
                className="bg-secondary text-foreground border border-border px-3 rounded hover:bg-primary/10 disabled:opacity-30 flex items-center gap-1 text-xs"
              >
                <ListTodo size={14} /> + Task
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LinkPicker({
  tasks,
  onPick,
  onClose,
}: {
  tasks: Task[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const active = tasks.filter((t) => !t.completed);
    if (!q.trim()) return active.slice(0, 50);
    const needle = q.toLowerCase();
    return active.filter((t) => t.title.toLowerCase().includes(needle)).slice(0, 50);
  }, [tasks, q]);
  return (
    <div className="bg-card border border-border rounded p-2 space-y-2">
      <div className="flex items-center gap-2">
        <Search size={12} className="text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks to link…"
          className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={onClose} className="text-muted-foreground hover:text-destructive p-1">
          <X size={12} />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">No matching tasks</p>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className="w-full text-left text-xs text-foreground hover:bg-secondary rounded px-2 py-1"
            >
              {t.title}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
