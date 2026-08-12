"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, FolderCog, Archive, ArchiveRestore, Trash2, AlertTriangle, Pencil, Loader2, History, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { ModalListSkeleton } from "@/components/skeletons/PageSkeletons";
import { TMProject, TMProjectDeletion } from "@/types/taskManager";
import ProjectAuditLogDrawer from "./ProjectAuditLogDrawer";

// Rename a project — catches the exact-name mistake this was built for
// (typo at creation, wrong department, etc.) without needing to delete and
// recreate it, which would also orphan every task already filed under it.
// The server re-applies the same no-duplicate-names guardrail used on
// creation, so this can't quietly collide with another project either.
function EditProjectForm({ project, onCancel, onSaved }: { project: TMProject; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/task-manager/projects/${project.id}`, {
        name: name.trim(),
        description: description.trim(),
      });
      toast.success("Project updated");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to update project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border border-gray-200 bg-gray-50 rounded-lg p-3 space-y-2.5">
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Project Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-200 p-2 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full border border-gray-200 p-2 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} disabled={saving} className="text-xs font-medium text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Confirm-by-typing-the-name before a permanent delete goes through — the
// same server route re-checks this text server-side too (see
// DELETE /api/task-manager/projects/[id]), so this isn't just a UI
// speed bump.
function DeleteConfirm({ project, onCancel, onDeleted }: { project: TMProject; onCancel: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = typed.trim() === project.name;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/task-manager/projects/${project.id}`, { data: { confirm_name: typed.trim() } });
      toast.success(`"${project.name}" was permanently deleted.`);
      onDeleted();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to delete project");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mt-3 border border-red-200 bg-red-50 rounded-lg p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-red-700">
          This permanently deletes <strong>{project.name}</strong> and every task, history entry, and uploaded document tied to it. This cannot be undone.
        </p>
      </div>
      <input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={`Type "${project.name}" to confirm`}
        className="w-full border border-red-200 p-2 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={!matches || deleting}
          className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? "Deleting…" : "Permanently delete"}
        </button>
        <button onClick={onCancel} className="text-xs font-medium text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProjectRow({ project, onChanged }: { project: TMProject; onChanged: () => void }) {
  const [archiving, setArchiving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const toggleArchive = async () => {
    setArchiving(true);
    try {
      const nextStatus = project.status === "active" ? "archived" : "active";
      await api.patch(`/task-manager/projects/${project.id}`, { status: nextStatus });
      toast.success(nextStatus === "archived" ? `"${project.name}" archived.` : `"${project.name}" restored.`);
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to update project");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="border border-gray-100 rounded-xl p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate">{project.name}</p>
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                project.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {project.status}
            </span>
          </div>
          {project.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{project.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{project.task_count ?? 0} task{(project.task_count ?? 0) === 1 ? "" : "s"}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setShowHistory(true)}
            title="History"
            className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            title="Edit name / description"
            className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleArchive}
            disabled={archiving}
            title={project.status === "active" ? "Archive" : "Restore"}
            className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 disabled:opacity-40"
          >
            {project.status === "active" ? <Archive className="w-3.5 h-3.5" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setConfirmingDelete((v) => !v)}
            title="Delete permanently"
            className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <EditProjectForm
          project={project}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}

      {confirmingDelete && (
        <DeleteConfirm
          project={project}
          onCancel={() => setConfirmingDelete(false)}
          onDeleted={() => {
            setConfirmingDelete(false);
            onChanged();
          }}
        />
      )}

      {showHistory && <ProjectAuditLogDrawer project={project} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

// Collapsed by default behind the same dropdown treatment as Recently
// Deleted below — an org that archives a lot of old projects shouldn't have
// this list pushing Recently Deleted (and the modal's own scroll) down by
// default. Always expandable, and the open list scrolls past a handful of
// rows for the same reason.
function ArchivedSection({ archived, onChanged }: { archived: TMProject[]; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);

  if (archived.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Archived (0)</p>
        <p className="text-sm text-gray-400">No archived projects.</p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 mb-2"
      >
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Archived ({archived.length})</p>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
          {archived.map((p) => (
            <ProjectRow key={p.id} project={p} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

// Read-only — tombstone rows survive the project's own hard delete (see
// tm_project_deletions in schema.sql), so this is the only place a deleted
// project's name is still visible. No restore action; deletion stays
// instant and permanent. Collapsed by default behind a dropdown toggle, and
// the open list scrolls past a handful of rows — so a long deletion history
// doesn't push the rest of the modal down.
function RecentlyDeletedSection() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery<{ deletions: TMProjectDeletion[] }>({
    queryKey: ["tm-project-deletions"],
    queryFn: async () => (await api.get("/task-manager/projects/deleted")).data,
  });

  const deletions = data?.deletions ?? [];
  if (!isLoading && deletions.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 mb-2"
      >
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Recently Deleted{deletions.length > 0 ? ` (${deletions.length})` : ""}
        </p>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
          {isLoading && <ModalListSkeleton rows={2} />}
          {deletions.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-gray-600 truncate">{d.project_name}</p>
              <p className="text-[11px] text-gray-400 flex-shrink-0">
                {d.deleted_by_name} &middot; {new Date(d.deleted_at).toLocaleDateString("en-GB")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ManageProjectsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ projects: TMProject[] }>({
    queryKey: ["tm-projects", "all"],
    queryFn: async () => (await api.get("/task-manager/projects?include=all")).data,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["tm-projects"] });
    // Cheap to invalidate unconditionally even though only a delete actually
    // changes this list — archiving/renaming just refetches an unchanged
    // tombstone list.
    queryClient.invalidateQueries({ queryKey: ["tm-project-deletions"] });
  };

  const projects = data?.projects ?? [];
  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status === "archived");

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <FolderCog className="w-4 h-4 text-red-600" />
            <h2 className="text-base font-bold text-gray-900">Manage Projects</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {isLoading && <ModalListSkeleton rows={5} />}

          {!isLoading && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Active ({active.length})</p>
                <div className="space-y-2">
                  {active.length === 0 && <p className="text-sm text-gray-400">No active projects.</p>}
                  {active.map((p) => (
                    <ProjectRow key={p.id} project={p} onChanged={refresh} />
                  ))}
                </div>
              </div>

              <ArchivedSection archived={archived} onChanged={refresh} />

              <RecentlyDeletedSection />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
