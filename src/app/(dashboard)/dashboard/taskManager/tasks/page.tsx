"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart, Settings2, FolderCog } from "lucide-react";
import api from "@/lib/api";
import { TMProject } from "@/types/taskManager";
import { useCurrentUser } from "../useCurrentUser";
import ProjectSelect from "../components/ProjectSelect";
import NewProjectModal from "../components/NewProjectModal";
import TaskListView from "../components/TaskListView";
import SummaryView from "../components/SummaryView";
import GanttView from "../components/GanttView";
import ProjectSpanCard from "../components/ProjectSpanCard";
import MonthlyReportModal from "../components/MonthlyReportModal";
import AutomationSettingsModal from "../components/AutomationSettingsModal";
import ManageProjectsModal from "../components/ManageProjectsModal";
import { TaskManagerTasksSkeleton } from "@/components/skeletons/PageSkeletons";

type Tab = "summary" | "gantt" | "register" | "monitoring";

export default function TaskManagerTasksPage() {
  const {
    isLoading: userLoading,
    isSeniorManagement,
    allUsers,
    userId,
  } = useCurrentUser();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [tab, setTab] = useState<Tab>("register");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [showManageProjects, setShowManageProjects] = useState(false);

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
            <ProjectSelect
              projects={projects}
              selectedId={selectedProjectId}
              onSelect={setSelectedProjectId}
              onNewProject={() => setShowNewProject(true)}
              canCreate={isSeniorManagement}
            />

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
                      onClick={() => setTab(key)}
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

                {tab === "summary" && <SummaryView project={selectedProject} />}
                {tab === "gantt" && <GanttView project={selectedProject} />}
                {tab === "register" && (
                  <TaskListView
                    project={selectedProject}
                    projects={projects}
                    users={allUsers}
                    isSeniorManagement={isSeniorManagement}
                    currentUserId={userId ?? null}
                    variant="register"
                  />
                )}
                {tab === "monitoring" && (
                  <TaskListView
                    project={selectedProject}
                    projects={projects}
                    users={allUsers}
                    isSeniorManagement={isSeniorManagement}
                    currentUserId={userId ?? null}
                    variant="monitoring"
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
          onCreated={() => refetch()}
        />
      )}
      {showReport && (
        <MonthlyReportModal
          projects={projects}
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
