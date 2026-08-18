"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { FileBarChart, Settings2, FolderCog, BellRing } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { TMProject } from "@/types/taskManager";
import { useCurrentUser } from "../useCurrentUser";
import ProjectSelect from "../components/ProjectSelect";
import NewProjectModal from "../components/NewProjectModal";
import TaskListView, { LifecycleViewKey } from "../components/TaskListView";
import SummaryView from "../components/SummaryView";
import GanttView from "../components/GanttView";
import ProjectSpanCard from "../components/ProjectSpanCard";
import MonthlyReportModal from "../components/MonthlyReportModal";
import AutomationSettingsModal from "../components/AutomationSettingsModal";
import ManageProjectsModal from "../components/ManageProjectsModal";
import { TaskManagerTasksSkeleton } from "@/components/skeletons/PageSkeletons";

type Tab = "summary" | "gantt" | "register" | "monitoring";
const VALID_TABS: Tab[] = ["summary", "gantt", "register", "monitoring"];

function TaskManagerTasksPageContent() {
  const {
    isLoading: userLoading,
    isSeniorManagement,
    allUsers,
    userId,
  } = useCurrentUser();

  // Supports deep-linking straight to a specific project + tab (e.g. from
  // the dashboard Overview page's Overdue Tasks card) via
  // /dashboard/taskManager/tasks?project=<id>&tab=summary. Falls back to
  // the normal defaults (first project, Obligation Register) when either
  // param is absent or the project id isn't recognized — see the
  // "pick a default project" effect below, which already handles an
  // unrecognized selectedProjectId the same way.
  const searchParams = useSearchParams();
  const projectParam = searchParams?.get("project") ?? null;
  const tabParam = searchParams?.get("tab") as Tab | null;

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectParam,
  );
  const [tab, setTab] = useState<Tab>(
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : "register",
  );
  const [showNewProject, setShowNewProject] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [showManageProjects, setShowManageProjects] = useState(false);
  const [notifying, setNotifying] = useState(false);
  // Set when a Summary page stat card is clicked — tells whichever
  // TaskListView mounts next which filter tab to open on. navNonce forces
  // a remount even if we're already sitting on that same tab (TaskListView
  // only reads initialFilter once, on mount — see its comment). Cleared
  // whenever the reviewer manually clicks a top-level tab, so it doesn't
  // keep re-applying a stale filter every time they leave and come back.
  const [navFilter, setNavFilter] = useState<{ variant: "register" | "monitoring"; filter: LifecycleViewKey } | null>(null);
  const [navNonce, setNavNonce] = useState(0);

  const {
    data,
    isLoading: projectsLoading,
    refetch,
  } = useQuery<{ projects: TMProject[] }>({
    queryKey: ["tm-projects"],
    queryFn: async () => (await api.get("/task-manager/projects")).data,
    enabled: !userLoading,
  });

  const projects = data?.projects ?? [];

  useEffect(() => {
    if (projects.length === 0) return;

    if (
      !selectedProjectId ||
      !projects.some((p) => p.id === selectedProjectId)
    ) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) ?? null;

  // Manual, on-demand — see sendAssignmentNotifications for why this isn't
  // fired automatically on every task write. Safe to click repeatedly: it's
  // always a fresh snapshot of who's currently assigned what in this
  // project, not a "what's new" diff.
  const handleNotifyAssignees = async () => {
    if (!selectedProject) return;
    setNotifying(true);
    try {
      const res = await api.post(`/task-manager/projects/${selectedProject.id}/notify-assignees`);
      const { notified, tasksSent, skippedNoEmail } = res.data as {
        notified: number;
        tasksSent: number;
        skippedNoEmail: number;
      };
      if (notified === 0) {
        toast.error(
          skippedNoEmail > 0
            ? "No one could be notified — the assigned staff don't have an email on file."
            : "No one is currently assigned a task in this project.",
        );
      } else {
        toast.success(`Notified ${notified} ${notified === 1 ? "person" : "people"} about ${tasksSent} task${tasksSent === 1 ? "" : "s"}.`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to send notifications");
    } finally {
      setNotifying(false);
    }
  };

  const handleNavigateFromSummary = (variant: "register" | "monitoring", filter: LifecycleViewKey) => {
    setNavFilter({ variant, filter });
    setNavNonce((n) => n + 1);
    setTab(variant);
  };

  if (userLoading || projectsLoading) {
    return <TaskManagerTasksSkeleton />;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Task Manager</h1>
          <p className="text-sm text-gray-500 mt-1">
            Projects, tasks and deadlines — built from documents or entered by
            hand.
          </p>
        </div>
        {isSeniorManagement && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowReport(true)}
              className="flex items-center gap-2 border border-gray-200 text-gray-700 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              <FileBarChart className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Monthly Report</span>
              <span className="sm:hidden">Report</span>
            </button>
            <button
              onClick={() => setShowAutomation(true)}
              className="flex items-center gap-2 border border-gray-200 text-gray-700 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              <Settings2 className="w-4 h-4 shrink-0" />
              Automation
            </button>
            <button
              onClick={() => setShowManageProjects(true)}
              className="flex items-center gap-2 border border-gray-200 text-gray-700 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              <FolderCog className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Manage Projects</span>
              <span className="sm:hidden">Projects</span>
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        {projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-sm text-gray-500">
              {isSeniorManagement
                ? "No projects yet — create one to get started."
                : "You don't have any tasks assigned yet."}
            </p>
            {isSeniorManagement && (
              <button
                onClick={() => setShowNewProject(true)}
                className="mt-4 bg-red-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-red-700"
              >
                + New Project
              </button>
            )}
          </div>
        ) : (
          <>
            {selectedProject && (
              <div className="mb-3">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  {selectedProject.name}
                </h2>
                {selectedProject.description && (
                  <p className="text-sm text-gray-500 mt-1">{selectedProject.description}</p>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <ProjectSelect
                projects={projects}
                selectedId={selectedProjectId}
                onSelect={setSelectedProjectId}
                onNewProject={() => setShowNewProject(true)}
                canCreate={isSeniorManagement}
              />
              {isSeniorManagement && selectedProject && (
                <button
                  onClick={handleNotifyAssignees}
                  disabled={notifying}
                  title="Emails everyone currently assigned a task in this project, with a link to the dashboard"
                  className="flex items-center gap-2 border border-gray-200 text-gray-700 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg hover:bg-gray-50 whitespace-nowrap disabled:opacity-60 shrink-0"
                >
                  <BellRing className="w-4 h-4 shrink-0" />
                  {notifying ? "Notifying…" : "Notify Assignees"}
                </button>
              )}
            </div>

            {selectedProject && <ProjectSpanCard project={selectedProject} />}

            {selectedProject ? (
              <>
                <div className="flex items-center gap-1 mt-4 mb-5 border-b border-gray-100 overflow-x-auto -mx-1 px-1 pb-0.5">
                  {(
                    [
                      ["summary", "Summary"],
                      ["gantt", "Dashboard / Gantt"],
                      ["register", "Obligation Register"],
                      ["monitoring", "Monitoring Schedule"],
                    ] as [Tab, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTab(key);
                        setNavFilter(null);
                      }}
                      className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap shrink-0 ${
                        tab === key
                          ? "border-red-600 text-red-600"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {key === "gantt" ? (
                        <>
                          <span className="sm:hidden">Gantt</span>
                          <span className="hidden sm:inline">{label}</span>
                        </>
                      ) : key === "register" ? (
                        <>
                          <span className="sm:hidden">Register</span>
                          <span className="hidden sm:inline">{label}</span>
                        </>
                      ) : key === "monitoring" ? (
                        <>
                          <span className="sm:hidden">Monitoring</span>
                          <span className="hidden sm:inline">{label}</span>
                        </>
                      ) : (
                        label
                      )}
                    </button>
                  ))}
                </div>

                {tab === "summary" && (
                  <SummaryView project={selectedProject} onNavigate={handleNavigateFromSummary} />
                )}
                {tab === "gantt" && (
                  <GanttView project={selectedProject} onNavigate={handleNavigateFromSummary} />
                )}
                {tab === "register" && (
                  <TaskListView
                    key={navFilter?.variant === "register" ? `register-${navNonce}` : "register"}
                    project={selectedProject}
                    projects={projects}
                    users={allUsers}
                    isSeniorManagement={isSeniorManagement}
                    currentUserId={userId ?? null}
                    variant="register"
                    initialFilter={navFilter?.variant === "register" ? navFilter.filter : undefined}
                  />
                )}
                {tab === "monitoring" && (
                  <TaskListView
                    key={navFilter?.variant === "monitoring" ? `monitoring-${navNonce}` : "monitoring"}
                    project={selectedProject}
                    projects={projects}
                    users={allUsers}
                    isSeniorManagement={isSeniorManagement}
                    currentUserId={userId ?? null}
                    variant="monitoring"
                    initialFilter={navFilter?.variant === "monitoring" ? navFilter.filter : undefined}
                  />
                )}
              </>
            ) : null}
          </>
        )}
      </div>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={async (newProjectId) => {
            // Refetch BEFORE switching — the "pick a default project" effect
            // above resets selectedProjectId to projects[0] whenever it
            // doesn't recognize the current id, and the new project isn't in
            // `projects` until this refetch resolves. Setting it first would
            // just get immediately overridden back to whatever was selected
            // before.
            await refetch();
            setSelectedProjectId(newProjectId);
          }}
        />
      )}
      {showReport && (
        <MonthlyReportModal
          projects={projects}
          users={allUsers}
          onClose={() => setShowReport(false)}
        />
      )}
      {showAutomation && (
        <AutomationSettingsModal users={allUsers} onClose={() => setShowAutomation(false)} />
      )}
      {showManageProjects && (
        <ManageProjectsModal onClose={() => setShowManageProjects(false)} />
      )}
    </div>
  );
}

export default function TaskManagerTasksPage() {
  return (
    <Suspense fallback={<TaskManagerTasksSkeleton />}>
      <TaskManagerTasksPageContent />
    </Suspense>
  );
}
