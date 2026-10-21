import { redirect } from "next/navigation";

/**
 * Pre-beta: accounts are created by invitation, so public sign-up sends visitors to the
 * waitlist. /login stays open for invited beta users and the founder.
 */
export default function SignupPage() {
  redirect("/#waitlist");
}
