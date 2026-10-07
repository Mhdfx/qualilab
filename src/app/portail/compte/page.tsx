import { Building2, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePortalPage } from "@/lib/portal-server";
import { ChangePasswordForm } from "../_components/ChangePasswordForm";

export const metadata = { title: "Mon compte" };

/**
 * « Mon compte » (PORTAIL.md §2): who is signed in, for which client, and
 * the password change. Shown even when the client's portal is closed —
 * changing one's password reveals nothing.
 */
export default async function PortailComptePage() {
  const { session, access } = await requirePortalPage();

  return (
    <div>
      <PageHeader badge="Espace client" title="Mon compte" subtitle="Vos informations de connexion et votre mot de passe." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Compte</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div>
                <dt className="text-xs text-slate-500">Nom</dt>
                <dd className="font-medium text-slate-800">{session.name}</dd>
                <dd className="font-mono text-xs text-slate-500">Identifiant : {session.username}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div>
                <dt className="text-xs text-slate-500">Client</dt>
                <dd className="font-medium text-slate-800">
                  {access.ok ? access.clientName : "Accès au portail fermé"}
                </dd>
              </div>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Pour modifier votre nom ou créer un compte pour un collègue, contactez le laboratoire.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Changer mon mot de passe</h2>
          <ChangePasswordForm />
        </Card>
      </div>
    </div>
  );
}
