import { KeyRound } from "lucide-react";
import { PASSWORD_CHANGE_NOTICE } from "@/lib/password-change";

/**
 * « Mon compte » while the password must be changed (Q81, RETOUR-LABO-19-10.md
 * H1): every other page and route leads here until the person chooses their
 * own password. `issuedBy` names who gave the current one — the
 * administrator for the laboratory's staff, the laboratory for a client.
 */
export function PasswordRequiredNotice({ issuedBy }: { issuedBy: "administrateur" | "laboratoire" }) {
  const who = issuedBy === "administrateur" ? "L'administrateur" : "Le laboratoire";
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
    >
      <KeyRound className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{PASSWORD_CHANGE_NOTICE}</p>
        <p className="mt-0.5 text-sm">
          {who}{" "}a créé votre compte ou réinitialisé votre mot de passe. Saisissez le mot de passe qu&apos;il
          vous a communiqué, puis choisissez le vôtre : votre espace s&apos;ouvrira ensuite.
        </p>
      </div>
    </div>
  );
}
