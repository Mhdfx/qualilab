import { Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PORTAL_REFUSAL_MESSAGES, type PortalRefusal } from "@/lib/portal-access";

/**
 * What a portal account sees when its client is archived, merged or missing
 * (PORTAIL.md §1): the reason, and no data at all.
 */
export function PortalClosed({ reason }: { reason: PortalRefusal }) {
  return (
    <div>
      <PageHeader badge="Espace client" title="Accès au portail fermé" />
      <Card className="flex items-start gap-4 p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p role="alert" className="text-sm font-medium text-slate-800">
            {PORTAL_REFUSAL_MESSAGES[reason]}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Vos échantillons et vos rapports ne sont pas affichés tant que l&apos;accès est fermé.
            Vous pouvez toujours changer votre mot de passe dans « Mon compte ».
          </p>
        </div>
      </Card>
    </div>
  );
}
