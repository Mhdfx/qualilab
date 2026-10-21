import { redirect } from "next/navigation";
import { getSession, landingPath, signedOutPath } from "@/lib/auth";

/**
 * « / »: the signed-in account's landing page — its dashboard, or its
 * « Mon compte » while its password must be changed (Q81, `landingPath`).
 * The sign-in form comes here after a successful sign-in. Without a
 * session, the sign-in page — saying « Session fermée après inactivité. »
 * when the server closed the one the browser still names (`signedOutPath`).
 */
export default async function HomePage() {
  const session = await getSession();
  if (session) redirect(landingPath(session));
  redirect(await signedOutPath());
}
