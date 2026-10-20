import { redirect } from "next/navigation";
import { getSession, landingPath } from "@/lib/auth";

/**
 * « / »: the signed-in account's landing page — its dashboard, or its
 * « Mon compte » while its password must be changed (Q81, `landingPath`).
 * The sign-in form comes here after a successful sign-in.
 */
export default async function HomePage() {
  const session = await getSession();
  if (session) redirect(landingPath(session));
  redirect("/login");
}
