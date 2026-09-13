import { redirect } from "next/navigation";

/** Phase 9: the one-sample form gave way to the visit; the old address stays valid. */
export default function NouveauPrelevementPage() {
  redirect("/preleveur/nouvelle-visite");
}
