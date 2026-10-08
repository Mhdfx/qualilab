import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import type { Role } from "@/lib/roles";
import type { AuditAction } from "@/lib/audit";

export const metadata = { title: "Journal d'audit" };

/**
 * The audit journal — the traceability promise made visible.
 *
 * Read-only by construction: nothing in the interface can alter an entry, and
 * the newest are shown first because that is what an investigation looks at.
 */

/**
 * FACTURATION.md, AMENDEMENT.md, PORTAIL.md — typed against `AUDIT_ACTIONS`,
 * so a new action of those slices cannot reach the journal unlabelled.
 */
const SLICE_ACTION_LABELS = {
  INVOICE_DRAFT_CREATED: "Brouillon de facture enregistré",
  INVOICE_DRAFT_UPDATED: "Brouillon de facture modifié",
  INVOICE_DRAFT_DELETED: "Brouillon de facture supprimé",
  INVOICE_ISSUED: "Facture émise",
  INVOICE_CANCELLED: "Facture annulée",
  CREDIT_NOTE_ISSUED: "Avoir émis",
  PAYMENT_RECORDED: "Règlement enregistré",
  PAYMENT_DELETED: "Règlement supprimé",
  REPORT_REOPENED: "Rapport rouvert pour amendement",
  REPORT_AMENDED: "Rapport amendé validé",
  REPORT_DUPLICATE: "Duplicata de rapport édité",
  PORTAL_LOGIN: "Connexion au portail client",
} satisfies Record<AuditAction, string>;

/** Plain French for each recorded action. */
const ACTION_LABELS: Record<string, string> = {
  ...SLICE_ACTION_LABELS,
  SAMPLE_CREATED: "Échantillon créé",
  SERIE_CREATED: "Visite enregistrée",
  DEPOT_CREATED: "Dépôt enregistré",
  SERIE_UPDATED: "Visite complétée",
  SAMPLE_RECEIVED: "Échantillon réceptionné",
  SERIE_RECEIVED: "Série réceptionnée",
  SAMPLE_CANCELLED: "Échantillon annulé",
  SAMPLES_EXPORTED: "Synthèse des analyses exportée (Excel)",
  DESTRUCTION_NOTIFIED: "Client informé d'une destruction",
  REGULATION_CREATED: "Réglementation créée",
  REGULATION_UPDATED: "Réglementation modifiée",
  SAMPLE_REGULATION_SET: "Réglementation choisie pour un échantillon",
  SAMPLE_REACTIVATED: "Échantillon réactivé",
  SAMPLE_INTAKE_CORRECTED: "Fiche d'échantillon corrigée",
  PROFILE_CREATED: "Profil d'analyses créé",
  PROFILE_UPDATED: "Profil d'analyses modifié",
  SITE_CREATED: "Site créé",
  SITE_UPDATED: "Site modifié",
  DOCUMENT_REFERENCE_UPDATED: "Cartouche de document modifiée",
  SAMPLE_PROGRAMMED: "Programme d'analyse confirmé",
  SAMPLE_PROGRAMME_UPDATED: "Programme d'analyse modifié",
  SAMPLE_ANALYSIS_STARTED: "Analyse démarrée",
  RESULTS_SAVED: "Résultats enregistrés",
  RESULTS_SUBMITTED: "Résultats soumis à validation",
  SAMPLE_VALIDATED_TECHNICAL: "Validation technique",
  SAMPLE_APPROVED: "Validation administrative",
  SAMPLE_REJECTED: "Échantillon renvoyé au technicien",
  REPORT_SENT: "Rapport envoyé",
  REPORT_DOWNLOADED: "Rapport téléchargé",
  CONTAMINATION_ALERT_SENT: "Alerte de contamination envoyée",
  // Entries written before FACTURATION.md (kept readable in the journal).
  INVOICE_CREATED: "Facture émise",
  INVOICE_DOWNLOADED: "Facture téléchargée",
  INVOICE_PAID: "Facture encaissée",
  INVOICE_REOPENED: "Facture rouverte",
  PURCHASE_INVOICE_PAID: "Facture fournisseur payée",
  PURCHASE_INVOICE_REOPENED: "Facture fournisseur rouverte",
  CLIENT_CREATED: "Client créé",
  CLIENT_UPDATED: "Client modifié",
  CLIENT_ARCHIVED: "Client archivé",
  CLIENT_RESTORED: "Client réactivé",
  CLIENT_MERGED: "Clients en double fusionnés",
  CLIENT_ATTACHED_AS_SITE: "Client rattaché comme site d'un autre client",
  CLIENT_BILLED_FOR_SET: "Client facturé lié à un client principal",
  CLIENT_BILLED_FOR_CLEARED: "Lien de client facturé retiré",
  SITE_BILLING_CHANGED: "« Facturé à » d'un site modifié",
  PARAMETER_CREATED: "Paramètre créé",
  PARAMETER_UPDATED: "Paramètre modifié",
  CRITERIA_IMPORTED: "Critères importés",
  CLIENT_MEMORY_IMPORTED: "Mémoire client importée",
  LEGACY_CATALOGUE_IMPORTED: "Catalogue de l'ancien logiciel importé",
  DEMO_DATA_PURGED: "Données de démonstration supprimées",
  COUNTER_SET: "Compteur de numérotation modifié",
  PRODUCT_TYPE_CREATED: "Type de produit créé",
  PRODUCT_TYPE_UPDATED: "Type de produit modifié",
  CRITERIA_UPDATED: "Critères modifiés",
  NORM_UPDATED: "Norme modifiée",
  CONCLUSION_SCALE_UPDATED: "Échelle de conclusion modifiée",
  SAMPLE_RELEASED: "Échantillon débloqué pour l'analyse",
  CLIENTS_IMPORTED: "Clients de l'ancien logiciel importés",
  SITES_IMPORTED: "Sites de l'ancien logiciel rattachés",
  COMPANY_UPDATED: "Coordonnées du laboratoire modifiées",
  LAB_SETTINGS_UPDATED: "Réglages du laboratoire modifiés",
  SERVICE_UPDATED: "Prestation du catalogue modifiée",
  USER_CREATED: "Utilisateur créé",
  USER_ROLE_CHANGED: "Rôle d'un utilisateur modifié",
  USER_PASSWORD_RESET: "Mot de passe réinitialisé",
  USER_PASSWORD_CHANGED: "Mot de passe modifié par l'utilisateur",
  USER_CLIENT_CHANGED: "Client d'un compte portail modifié",
  USER_DISABLED: "Compte désactivé",
  USER_ENABLED: "Compte réactivé",
  EQUIPMENT_CREATED: "Équipement créé",
  EQUIPMENT_UPDATED: "Équipement modifié",
  EQUIPMENT_ARCHIVED: "Équipement archivé",
  EQUIPMENT_RESTORED: "Équipement réactivé",
  TEMPERATURE_RECORDED: "Température relevée",
  TEMPERATURE_OUT_OF_RANGE: "Température hors limites relevée",
  CALIBRATION_RECORDED: "Étalonnage enregistré",
  EIL_CREATED: "Campagne EIL créée",
  EIL_UPDATED: "Campagne EIL modifiée",
  SUPPLIER_CREATED: "Fournisseur créé",
  SUPPLIER_UPDATED: "Fournisseur modifié",
  SUPPLIER_ARCHIVED: "Fournisseur archivé",
  SUPPLIER_RESTORED: "Fournisseur réactivé",
  PURCHASE_INVOICE_CREATED: "Facture fournisseur enregistrée",
  STOCK_ITEM_CREATED: "Article de stock créé",
  STOCK_ITEM_UPDATED: "Article de stock modifié",
  STOCK_ITEM_ARCHIVED: "Article de stock archivé",
  STOCK_ITEM_RESTORED: "Article de stock réactivé",
  STOCK_MOVEMENT: "Mouvement de stock",
};

export default async function JournalPage() {
  await requireRole("ADMIN");

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, role: true } } },
  });

  return (
    <div>
      <PageHeader
        badge="Système"
        title="Journal d'audit"
        subtitle="Qui a fait quoi, et quand. Les 200 dernières actions enregistrées."
      />

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Aucune action enregistrée pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const metadata = entry.metadata
                ? (JSON.parse(entry.metadata) as Record<string, unknown>)
                : {};
              const reference =
                (metadata.controlCode as string) ??
                (metadata.code as string) ??
                (metadata.number as string) ??
                (metadata.name as string) ??
                null;

              return (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                      {metadata.portal === true && " (portail client)"}
                      {reference && (
                        <span className="ml-2 font-mono text-xs text-slate-500">
                          {reference}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {entry.actor?.name ?? "Système"}
                      {entry.actor?.role && (
                        <> · {ROLE_LABELS[entry.actor.role as Role]}</>
                      )}
                    </p>
                  </div>
                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="shrink-0 text-xs tabular-nums text-slate-400"
                  >
                    {formatDateTime(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
