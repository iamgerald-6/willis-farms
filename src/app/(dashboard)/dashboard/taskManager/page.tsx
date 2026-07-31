"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import api from "@/lib/api";
import { TMProject } from "@/types/taskManager";
import { useCurrentUser } from "./useCurrentUser";
import ProjectPills from "./components/ProjectPills";
import NewProjectModal from "./components/NewProjectModal";
import TaskListView from "./components/TaskListView";
import SummaryView from "./components/SummaryView";
import GanttView from "./components/GanttView";
import CalendarView from "./components/CalendarView";
import MonthlyReportModal from "./components/MonthlyReportModal";

type Tab = "summary" | "gantt" | "register" | "monitoring" | "calendar";

export default function TaskManagerPage() {
  const { isLoading: userLoading, isSeniorManagement, allUsers, userId } = useCurrentUser();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("register");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const { data, isLoading: projectsLoading, refetch } = useQuery<{ projects: TMProject[] }>({
    queryKey: ["tm-projects"],
    queryFn: async () => (await api.get("/task-manager/projects")).data,
    enabled: !userLoading,
  });

  const projects = data?.projects ?? [];

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  if (userLoading || projectsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-sm text-gray-400">Loading Task Manager…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Manager</h1>
          <p className="text-sm text-gray-500 mt-1">Projects, tasks and deadlines — built from documents or entered by hand.</p>
        </div>
        {isSeniorManagement && (
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-gray-50 flex-shrink-0"
          >
            <FileBarChart className="w-4 h-4" /> Monthly Report
          </button>
        )}
      </div>

      <div className="mt-6">
        {projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-sm text-gray-500">
              {isSeniorManagement ? "No projects yet — create one to get started." : "You don't have any tasks assigned yet."}
            </p>
            {isSeniorManagement && (
              <button onClick={() => setShowNewProject(true)} className="mt-4 bg-red-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-red-700">
                + New Project
              </button>
            )}
          </div>
        ) : (
          <>
            <ProjectPills
              projects={projects}
              selectedId={selectedProjectId}
              onSelect={setSelectedProjectId}
              onNewProject={() => setShowNewProject(true)}
              canCreate={isSeniorManagement}
            />

            {selectedProject && (
              <>
                <div className="flex items-center gap-1 mt-4 mb-5 border-b border-gray-100 overflow-x-auto">
                  {([
                    ["summary", "Summary"],
                    ["gantt", "Dashboard / Gantt"],
                    ["register", "Obligation Register"],
                    ["monitoring", "Monitoring Schedule"],
                    ["calendar", "Compliance Calendar"],
                  ] as [Tab, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
                        tab === key ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === "summary" && <SummaryView project={selectedProject} />}
                {tab === "gantt" && <GanttView project={selectedProject} />}
                {tab === "register" && (
                  <TaskListView
                    project={selectedProject}
                    users={allUsers}
                    isSeniorManagement={isSeniorManagement}
                    currentUserId={userId ?? null}
                    variant="register"
                  />
                )}
                {tab === "monitoring" && (
                  <TaskListView
                    project={selectedProject}
                    users={allUsers}
                    isSeniorManagement={isSeniorManagement}
                    currentUserId={userId ?? null}
                    variant="monitoring"
                  />
                )}
                {tab === "calendar" && <CalendarView projects={projects} />}
              </>
            )}
          </>
        )}
      </div>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={() => refetch()}
        />
      )}
      {showReport && <MonthlyReportModal projects={projects} onClose={() => setShowReport(false)} />}
    </div>
  );
}
