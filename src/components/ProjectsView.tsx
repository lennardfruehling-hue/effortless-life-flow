import { useState } from "react";
import { Project, Task } from "@/lib/types";
import { Plus, Trash2, FolderKanban } from "lucide-react";
import { v4 as uuid } from "uuid";

interface ProjectsViewProps {
  projects: Project[];
  tasks: Task[];
  onSaveProjects: (p: Project[]) => void;
}

export default function ProjectsView({ projects, tasks, onSaveProjects }: ProjectsViewProps) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const addProject = () => {
    if (!name.trim()) return;
    onSaveProjects([
      ...projects,
      { id: uuid(), name: name.trim(), description: desc.trim() || undefined, createdAt: new Date().toISOString() },
    ]);
    setName("");
    setDesc("");
  };

  const deleteProject = (id: string) => {
    onSaveProjects(projects.filter((p) => p.id !== id));
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
      <h2 className="text-2xl font-bold text-foreground mb-1">Projects</h2>
      <p className="text-sm text-muted-foreground mb-6">Long-term projects linked to J-category tasks</p>

      {/* Add form */}
      <div className="flex gap-2 mb-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => e.key === "Enter" && addProject()}
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description (optional)"
          className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={addProject}
          disabled={!name.trim()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Project list */}
      <div className="space-y-3">
        {projects.map((project) => {
          const projectTasks = tasks.filter((t) => t.projectId === project.id);
          const completedCount = projectTasks.filter((t) => t.completed).length;
          return (
            <div key={project.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <FolderKanban size={18} className="text-cat-j mt-0.5" />
                  <div>
                    <h3 className="font-medium text-foreground">{project.name}</h3>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{project.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2 font-mono">
                      {projectTasks.length} tasks · {completedCount} done
                    </p>
                  </div>
                </div>
                <button onClick={() => deleteProject(project.id)} className="text-muted-foreground hover:text-destructive p-1">
                  <Trash2 size={14} />
                </button>
              </div>
              {projectTasks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {projectTasks.map((t) => (
                    <p key={t.id} className={`text-xs ${t.completed ? "line-through text-muted-foreground" : "text-secondary-foreground"}`}>
                      {t.completed ? "✓" : "○"} {t.title}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">No projects yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a project to group your J-category long-term tasks
          </p>
        </div>
      )}
    </div>
  );
}
