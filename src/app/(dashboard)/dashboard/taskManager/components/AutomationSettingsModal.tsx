"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { ModalListSkeleton } from "@/components/skeletons/PageSkeletons";
import { TMReportSchedule, TMReminderSettings } from "@/types/taskManager";

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export default function AutomationSettingsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery<{ schedule: TMReportSchedule }>({
    queryKey: ["tm-report-schedule"],
    queryFn: async () => (await api.get("/task-manager/reports/schedule")).data,
  });
  const { data: reminderData, isLoading: reminderLoading } = useQuery<{ settings: TMReminderSettings }>({
    queryKey: ["tm-reminder-settings"],
    queryFn: async () => (await api.get("/task-manager/reminders/settings")).data,
  });
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [scheduleRecipients, setScheduleRecipients] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [daysBeforeDue, setDaysBeforeDue] = useState(14);
  const [reminderCc, setReminderCc] = useState("");
  const [savingReminders, setSavingReminders] = useState(false);
  const [testingReminders, setTestingReminders] = useState(false);

  useEffect(() => {
    if (scheduleData?.schedule) {
      setScheduleEnabled(scheduleData.schedule.enabled);
      setDayOfMonth(scheduleData.schedule.day_of_month);
      setScheduleRecipients(scheduleData.schedule.recipients.join(", "));
    }
  }, [scheduleData]);

  useEffect(() => {
    if (reminderData?.settings) {
      setRemindersEnabled(reminderData.settings.enabled);
      setDaysBeforeDue(reminderData.settings.days_before_due);
      setReminderCc((reminderData.settings.cc_recipients ?? []).join(", "));
    }
  }, [reminderData]);

  const handleSaveSchedule = async () => {
    const emails = scheduleRecipients.split(",").map((e) => e.trim()).filter(Boolean);
    if (scheduleEnabled && emails.length === 0) {
      toast.error("Add at least one recipient before enabling the schedule");
      return;
    }
    setSavingSchedule(true);
    try {
      await api.put("/task-manager/reports/schedule", { enabled: scheduleEnabled, day_of_month: dayOfMonth, recipients: emails });
      toast.success("Report schedule saved");
      queryClient.invalidateQueries({ queryKey: ["tm-report-schedule"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to save schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleTestReminders = async () => {
    setTestingReminders(true);
    try {
      const res = await api.post("/task-manager/reminders/test");
      const { skipped, reason, dueSoonSent, overdueSent } = res.data ?? {};
      if (skipped) {
        toast.info(reason ? `Nothing sent — ${reason}` : "Nothing sent");
      } else if ((dueSoonSent ?? 0) === 0 && (overdueSent ?? 0) === 0) {
        toast.info("No qualifying tasks right now — nothing to remind anyone about.");
      } else {
        toast.success(`Sent: ${dueSoonSent ?? 0} due-soon, ${overdueSent ?? 0} overdue reminder${(dueSoonSent ?? 0) + (overdueSent ?? 0) === 1 ? "" : "s"}.`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to run test");
    } finally {
      setTestingReminders(false);
    }
  };

  const handleSaveReminders = async () => {
    const cc = reminderCc.split(",").map((e) => e.trim()).filter(Boolean);
    setSavingReminders(true);
    try {
      await api.put("/task-manager/reminders/settings", { enabled: remindersEnabled, days_before_due: daysBeforeDue, cc_recipients: cc });
      toast.success("Reminder settings saved");
      queryClient.invalidateQueries({ queryKey: ["tm-reminder-settings"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to save reminder settings");
    } finally {
      setSavingReminders(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-red-600" />
            <h2 className="text-base font-bold text-gray-900">Automation</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* ── Monthly report schedule ─────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Automatic monthly report</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-xs font-medium text-gray-600">{scheduleEnabled ? "On" : "Off"}</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              When on, the previous month's report is generated and emailed automatically at 9am on the day below — no need to send it by hand.
            </p>

            {scheduleLoading ? (
              <ModalListSkeleton rows={3} />
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Day of month</label>
                  <select
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {ordinal(d)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Send to (comma-separated emails)</label>
                  <input
                    value={scheduleRecipients}
                    onChange={(e) => setScheduleRecipients(e.target.value)}
                    placeholder="e.g. gm@willsfarms.com, ops@willsfarms.com"
                    className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <button
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                  className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {savingSchedule && <Loader2 className="w-4 h-4 animate-spin" />} Save schedule
                </button>
              </>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Deadline reminders ──────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Deadline reminders</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remindersEnabled}
                  onChange={(e) => setRemindersEnabled(e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-xs font-medium text-gray-600">{remindersEnabled ? "On" : "Off"}</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Every task's owner is emailed automatically — no list to set up here. Every Monday at 9am, each owner
              gets one summary email listing everything currently overdue and everything due within the window
              below — a fresh snapshot each week, not a running stream of separate alerts.
            </p>

            {reminderLoading ? (
              <ModalListSkeleton rows={3} />
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Days ahead to include as "coming up soon"</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={daysBeforeDue}
                    onChange={(e) => setDaysBeforeDue(Number(e.target.value))}
                    className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                    Also notify (optional)
                  </label>
                  <input
                    value={reminderCc}
                    onChange={(e) => setReminderCc(e.target.value)}
                    placeholder="e.g. ops@willsfarms.com — leave blank if not needed"
                    className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Backup addresses copied on every reminder, in case an owner misses theirs. Not required.
                  </p>
                </div>

                <button
                  onClick={handleSaveReminders}
                  disabled={savingReminders}
                  className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {savingReminders && <Loader2 className="w-4 h-4 animate-spin" />} Save reminder settings
                </button>

                <button
                  onClick={handleTestReminders}
                  disabled={testingReminders}
                  className="w-full border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {testingReminders && <Loader2 className="w-4 h-4 animate-spin" />} Send test now
                </button>
                <p className="text-xs text-gray-400">
                  Runs the same weekly summary right now, any day — no need to wait for Monday. It's a real send
                  (not a preview), but it's just today's current picture, so running it again just resends the
                  same list — it won't affect what Monday's actual run includes.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
