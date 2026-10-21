import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";

/** Sends the user to their first workspace; staff without one go to the admin area. */
export default async function DashboardIndex() {
  const { me } = await requireSession("/dashboard");
  const first = me.workspaces[0];
  if (first) redirect(`/dashboard/${first.id}`);
  if (me.platformRole !== "USER") redirect("/admin");
  // Accounts without a workspace are not part of the beta yet.
  redirect("/#waitlist");
}
