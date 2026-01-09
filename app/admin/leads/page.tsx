import { Container } from "@/components/Container";
import { getSupabaseAdmin, LeadStatus } from "@/lib/supabaseServer";
import { classNames } from "@/lib/utils";

type LeadRow = {
  id: string;
  received_at: string;
  lead_type: "gilts" | "pork";
  full_name: string;
  company: string;
  phone: string;
  email: string;
  location: string;
  status: LeadStatus;
};

const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost", "archived"];

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default async function LeadsInbox({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = getSupabaseAdmin();

  const statusParam = (searchParams?.status ?? "all") as string | string[];
  const status = (Array.isArray(statusParam) ? statusParam[0] : statusParam) || "all";

  const qParam = (searchParams?.q ?? "") as string | string[];
  const q = (Array.isArray(qParam) ? qParam[0] : qParam) || "";

  let leads: LeadRow[] = [];

  if (supabase) {
    let query = supabase
      .from("leads")
      .select("id, received_at, lead_type, full_name, company, phone, email, location, status")
      .order("received_at", { ascending: false })
      .limit(300);

    if (status !== "all") query = query.eq("status", status);
    if (q.trim()) {
      // Supabase PostgREST OR filter
      const term = q.trim().replace(/[,]/g, " ");
      query = query.or(
        `full_name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      // Avoid leaking details; show a compact message.
      console.error("ADMIN_LEADS_QUERY_ERROR", error);
    }
    leads = (data as any) || [];
  }

  async function updateStatus(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const next = String(formData.get("status") || "") as LeadStatus;

    if (!id || !STATUSES.includes(next)) return;

    const sb = getSupabaseAdmin();
    if (!sb) return;

    const { error } = await sb.from("leads").update({ status: next }).eq("id", id);
    if (error) console.error("ADMIN_LEADS_UPDATE_ERROR", error);
  }

  return (
    <div className="bg-white">
      <Container className="py-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">Admin</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-brand-dark">Leads inbox</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-brand-gray">
              Conversion leads captured from the website (Gilts and Pork B2B). Update statuses to manage follow-up.
            </p>
            {!supabase && (
              <div className="mt-4 rounded-2xl bg-brand-light p-4 ring-1 ring-black/5">
                <p className="text-sm font-semibold text-brand-dark">Database not configured</p>
                <p className="mt-1 text-sm text-brand-gray">
                  Set <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
                  <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> to enable the leads inbox.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form className="flex gap-2" action="/admin/leads" method="get">
              <input
                name="q"
                defaultValue={q}
                placeholder="Search name, company, email, phone"
                className="w-full min-w-[260px] rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-brand-dark placeholder:text-brand-gray/70 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
              <select
                name="status"
                defaultValue={status}
                className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="all">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.toUpperCase()}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-2xl bg-brand-red px-5 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-red focus:ring-offset-2"
              >
                Filter
              </button>
            </form>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border border-black/5 shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white text-left text-sm">
              <thead className="bg-brand-light text-xs font-semibold uppercase tracking-wide text-brand-gray">
                <tr>
                  <th className="px-5 py-4">Received</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Name</th>
                  <th className="px-5 py-4">Company/Farm</th>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-brand-gray">
                      No leads found.
                    </td>
                  </tr>
                ) : (
                  leads.map((l) => (
                    <tr key={l.id} className="hover:bg-brand-light/40">
                      <td className="px-5 py-4 text-brand-gray">{fmtDate(l.received_at)}</td>
                      <td className="px-5 py-4">
                        <span className={classNames(
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-black/5",
                          l.lead_type === "gilts" ? "bg-white text-brand-dark" : "bg-white text-brand-dark"
                        )}>
                          {l.lead_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-brand-dark">{l.full_name}</td>
                      <td className="px-5 py-4 text-brand-gray">{l.company}</td>
                      <td className="px-5 py-4 text-brand-gray">
                        <div className="grid">
                          <a className="font-semibold text-brand-dark hover:underline" href={`mailto:${l.email}`}>{l.email}</a>
                          <span>{l.phone}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-brand-gray">{l.location}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand-gray ring-1 ring-black/5">
                          {l.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <form action={updateStatus} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={l.id} />
                          <select
                            name="status"
                            defaultValue={l.status}
                            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-red"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.toUpperCase()}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-xl bg-brand-red px-3 py-2 text-xs font-semibold text-white shadow-soft hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-red focus:ring-offset-2"
                          >
                            Save
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-brand-light p-5 ring-1 ring-black/5">
          <p className="text-sm font-semibold text-brand-dark">Operational note</p>
          <p className="mt-2 text-sm leading-relaxed text-brand-gray">
            This inbox is intentionally lightweight. If you want assignment, reminders, pipeline stages, or email notifications,
            integrate a CRM (HubSpot/Zoho/Salesforce) in <span className="font-mono">app/api/lead/route.ts</span>.
          </p>
        </div>
      </Container>
    </div>
  );
}
