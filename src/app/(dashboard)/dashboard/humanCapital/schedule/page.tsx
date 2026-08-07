import { redirect } from "next/navigation";

// Schedule Planner moved to Task Manager → Calendar
export default function SchedulePlannerRedirectPage() {
  redirect("/dashboard/taskManager/calendar");
}
