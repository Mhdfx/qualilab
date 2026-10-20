import { BadgeCheck, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { passwordChangeGuards } from "@/lib/auth";
import { ROLE_LABELS, roleFunction } from "@/lib/roles";
import { ChangePasswordForm } from "@/app/portail/_components/ChangePasswordForm";
import { PasswordRequiredNotice } from "@/app/portail/_components/PasswordRequiredNotice";

export const metadata = { title: "Mon compte" };

/**
 * « Mon compte » of the laboratory's staff: who is signed in, under which
 * role, and the password change (`POST /api/compte/mot-de-passe`, which
 * closes the account's other sessions). The name, the identifier and the
 * role stay the administrator's (/admin/utilisateurs).
 *
 * « Mot de passe à changer » (Q81, RETOUR-LABO-19-10.md H1): an account the
 * administrator created or reset lands here from every page until it
 * chooses its own password — the notice on top, the form first; the change
 * then opens its dashboard.
 */
export default async function ComptePage() {
  const session = await passwordChangeGuards.requireRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "PROGRAMMATEUR",
    "TECHNICIEN",
    "VALIDATEUR",
    "DIRECTION",
    "GESTIONNAIRE",
    "COMPTABLE",
    "MAGASINIER",
    "ADMIN"
  );
  const labFunction = roleFunction(session.role);
  const required = session.mustChangePassword;

  const account = (
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
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <div>
            <dt className="text-xs text-slate-500">Rôle</dt>
            <dd className="font-medium text-slate-800">{ROLE_LABELS[session.role]}</dd>
            {labFunction && <dd className="text-xs text-slate-500">{labFunction}</dd>}
          </div>
        </div>
      </dl>
      <p className="mt-4 text-xs text-slate-500">
        {session.role === "ADMIN"
          ? "Le nom, l'identifiant et le rôle des comptes se modifient dans Utilisateurs."
          : "Pour modifier votre nom, votre identifiant ou votre rôle, adressez-vous à l'administrateur."}
      </p>
    </Card>
  );

  const password = (
    <Card className={`p-5 ${required ? "ring-2 ring-amber-300" : ""}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {required ? "Choisir mon mot de passe" : "Changer mon mot de passe"}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Les autres postes encore connectés à votre compte seront déconnectés.
      </p>
      <ChangePasswordForm endpoint="/api/compte/mot-de-passe" required={required} />
    </Card>
  );

  return (
    <div>
      <PageHeader badge={ROLE_LABELS[session.role]} title="Mon compte" subtitle="Vos informations de connexion et votre mot de passe." />

      {required && <PasswordRequiredNotice issuedBy="administrateur" />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {required ? (
          <>
            {password}
            {account}
          </>
        ) : (
          <>
            {account}
            {password}
          </>
        )}
      </div>
    </div>
  );
}
