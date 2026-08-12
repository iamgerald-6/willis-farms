import { redirect } from "next/navigation";

/** Legacy route — user management lives under access-control. */
export default function UsersRedirectPage() {
  redirect("/dashboard/access-control");
}
