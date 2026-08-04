import { redirect } from "next/navigation";

// /dashboard/taskManager now just forwards to the "Tasks" sub-page — the
// sidebar dropdown (see Sidebar.tsx) links directly to /taskManager/tasks
// and /taskManager/calendar, but this keeps any old bookmark or hardcoded
// link to the bare /dashboard/taskManager URL working.
export default function TaskManagerIndexPage() {
  redirect("/dashboard/taskManager/tasks");
}
