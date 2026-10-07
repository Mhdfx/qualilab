import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  Hash,
  FlaskConical,
  FileText,
  Archive,
  Pencil,
  GitMerge,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatCurrency } from "@/lib/labels";
import { holdingInvoiceItemWhere } from "@/lib/billing";
import { InvoiceStateBadge } from "@/components/invoices/InvoiceStateBadge";
import { documentLabel, invoiceFigures } from "@/components/invoices/invoice-view";
import { toMoney } from "@/lib/money";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { SitesManager } from "@/components/commercial/SitesManager";
import { ClientSummary } from "@/components/commercial/ClientSummary";
import { ClientMergeActions } from "@/components/commercial/ClientMergeActions";
import { BillingClientsCard } from "@/components/commercial/BillingClientsCard";
import { archivedBanner, archivedKind, importedParentId } from "@/components/commercial/client-actions-logic";
import { parseSampleSearch } from "@/lib/sample-search";
import { INVOICE_NOTICE_LABELS, sampleBillingNotice } from "@/lib/invoice-notices";
import { amendedNumber } from "@/lib/report-amendment";
import { searchSamples } from "@/lib/sample-search-server";
import { billingFigures } from "@/components/invoices/invoice-queries";

/**
 * Fiche client 360° — everything the laboratory knows about one client on a
 * single screen: who they are, who receives their mail, their samples, their
 * reports and their invoices.
 */

export const metadata = { title: "Fiche client" };
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("GESTIONNAIRE", "ADMIN");
  // The invoice screen lives in the admin space; the gestionnaire gets the
  // PDF itself (its endpoint admits the role) instead of a silent bounce.
  const invoiceHref = (id: string) =>
    session.role === "ADMIN" ? `/admin/factures/${id}` : `/api/invoices/${id}/pdf`;
  const { id } = await params;

  // The summary's period (slice F): the current month by default.
  const raw = await searchParams;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const summaryParams = new URLSearchParams({
    client: id,
    du: typeof raw.du === "string" ? raw.du : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    au: typeof raw.au === "string" ? raw.au : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  });
  const summarySearch = parseSampleSearch(summaryParams);

  const [client, samples, invoices, figures, sampleCount, reportCount, summary, mergeEntry] =
    await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        emails: { orderBy: { email: "asc" } },
        sites: {
          orderBy: [{ active: "desc" }, { name: "asc" }],
          include: { billingClient: { select: { id: true, name: true } } },
        },
        // CLIENTS-FUSION.md §2–4: where an archived duplicate went, and the
        // billing clients on either side of the link.
        mergedInto: { select: { id: true, name: true } },
        billedFor: { select: { id: true, name: true } },
        billingClients: { select: { id: true, name: true, archived: true }, orderBy: { name: "asc" } },
        billedSites: {
          select: { id: true, name: true, client: { select: { id: true, name: true } } },
          orderBy: { name: "asc" },
        },
      },
    }),
    prisma.sample.findMany({
      where: { clientId: id },
      select: {
        id: true,
        code: true,
        controlCode: true,
        type: true,
        status: true,
        produit: true,
        sampledAt: true,
        report: { select: { number: true, version: true, sentAt: true, amendmentPending: true } },
        // Billed already? The programme lets the invoice precede the result.
        // Only a line that holds its sample counts (a draft or an issued
        // invoice): a cancelled invoice gave it back, a credit note never
        // carries one (FACTURATION.md §1–2).
        invoiceItems: { where: holdingInvoiceItemWhere(), select: { invoiceId: true }, take: 1 },
      },
      orderBy: { sampledAt: "desc" },
      take: 25,
    }),
    prisma.invoice.findMany({
      where: { clientId: id },
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        issueDate: true,
        total: true,
        // What the invoice reads as (Émise, Partiellement payée, Annulée…).
        payments: { select: { amount: true } },
        creditNotes: { where: { kind: "AVOIR" }, select: { total: true } },
      },
      orderBy: { issueDate: "desc" },
      take: 25,
    }),
    // « Facturé » and « Encaissé » over ALL the client's invoices — the list
    // on screen is only the 25 most recent. FACTURATION.md §4: billed =
    // issued, not cancelled, less the credit notes; collected = settlements.
    billingFigures({ clientId: id }),
    prisma.sample.count({ where: { clientId: id } }),
    prisma.report.count({ where: { sample: { clientId: id } } }),
    searchSamples(summarySearch, { take: 5000 }),
    // « Fusionnée dans » or « Rattachée comme site de »: the journal knows which.
    prisma.auditLog.findFirst({
      where: { entity: "Client", entityId: id, action: { in: ["CLIENT_MERGED", "CLIENT_ATTACHED_AS_SITE"] } },
      orderBy: { createdAt: "desc" },
      select: { action: true },
    }),
  ]);

  if (!client) notFound();

  // A client archived by the import of the sites before `mergedIntoId`
  // existed (07/10): its journal entry names the parent it became a site of.
  let importedParent: { id: string; name: string } | null = null;
  if (client.archived && !client.mergedInto) {
    const archivedEntry = await prisma.auditLog.findFirst({
      where: { entity: "Client", entityId: id, action: "CLIENT_ARCHIVED" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const parentId = importedParentId(archivedEntry?.metadata);
    if (parentId && parentId !== id) {
      importedParent = await prisma.client.findUnique({ where: { id: parentId }, select: { id: true, name: true } });
    }
  }
  const keptRecord = client.mergedInto ?? importedParent;
  const banner = client.mergedInto
    ? archivedBanner(archivedKind(mergeEntry?.action), client.mergedInto.name)
    : importedParent
      ? archivedBanner("attached", importedParent.name)
      : null;
  const activeBillingClients = client.billingClients.filter((row) => !row.archived);

  return (
    <div>
      <Link
        href="/commercial"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Base clients
      </Link>

      <PageHeader
        badge={client.archived ? "Client archivé" : "Fiche client"}
        title={client.name}
        subtitle={client.contact ?? "Vue d'ensemble de l'activité de ce client."}
        action={
          <Link
            href={`/commercial/${client.id}/modifier`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Modifier
          </Link>
        }
      />

      {keptRecord && banner && (
        <p className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-brand/20 bg-brand-light/40 px-3 py-2.5 text-sm text-slate-700">
          <GitMerge className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          {banner.lead}{" "}
          <Link
            href={`/commercial/${keptRecord.id}`}
            className="rounded font-semibold text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {banner.name}
          </Link>
          <span className="text-slate-500">
            — cette fiche est archivée ; son historique reste consultable ici.
          </span>
        </p>
      )}

      {client.archived && !keptRecord && (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
          Ce client est archivé : il n&apos;apparaît plus dans les listes de
          sélection, mais son historique reste consultable.
        </p>
      )}

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Échantillons" value={sampleCount} icon={FlaskConical} accent="blue" />
          <StatCard label="Rapports" value={reportCount} icon={FileText} accent="emerald" />
          <StatCard label="Facturé" value={formatCurrency(figures.billed)} icon={FileText} accent="brand" />
          <StatCard label="Encaissé" value={formatCurrency(figures.collected)} icon={FileText} accent="violet" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="p-5 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Coordonnées
          </h2>
          <dl className="mt-4 space-y-3.5">
            <Field icon={Building2} label="Raison sociale">{client.name}</Field>
            <Field icon={Hash} label="ICE">
              {client.ice ? <span className="font-mono">{client.ice}</span> : <Missing />}
            </Field>
            <Field icon={Mail} label="Email principal">{client.email ?? <Missing />}</Field>
            <Field icon={Phone} label="Téléphone">{client.phone ?? <Missing />}</Field>
            <Field icon={MapPin} label="Adresse">{client.address ?? <Missing />}</Field>
          </dl>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Destinataires
          </h2>
          {client.emails.length === 0 ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              Aucune adresse enregistrée — les rapports et alertes ne pourront
              pas être envoyés.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {client.emails.map((entry) => (
                <li key={entry.id} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {entry.email}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                    {entry.label && (
                      <span className="text-slate-500">{entry.label}</span>
                    )}
                    {entry.forReports && (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                        rapports
                      </span>
                    )}
                    {entry.forAlerts && (
                      <span className="rounded-full bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700">
                        alertes
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <ClientSummary search={summarySearch} rows={summary.rows} total={summary.total} />

          <SitesManager
            clientId={client.id}
            clientName={client.name}
            initial={client.sites}
            canEdit={!client.archived}
            billingClients={activeBillingClients.map(({ id, name }) => ({ id, name }))}
          />

          <BillingClientsCard
            clientId={client.id}
            clientName={client.name}
            canEdit={!client.archived}
            billedFor={client.billedFor}
            billingClients={client.billingClients.map((row) => ({
              ...row,
              sites: client.sites
                .filter((site) => site.billingClientId === row.id)
                .map((site) => ({ id: site.id, name: site.name })),
            }))}
            billedSites={client.billedSites}
          />

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Échantillons récents
            </h2>
            {samples.length === 0 ? (
              <Empty>Aucun échantillon pour ce client.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {samples.map((sample) => {
                  // « Facturé avant résultat » / « annulé après facturation »
                  // (PROGRAMME.md §6) — only once an invoice line names it.
                  const notice =
                    sample.invoiceItems.length > 0
                      ? sampleBillingNotice(sample.status, sample.report?.amendmentPending === true)
                      : null;
                  return (
                  <li key={sample.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono font-semibold text-slate-900">
                          {sample.controlCode ?? sample.code}
                        </span>
                        <TypeBadge type={sample.type} />
                        <StatusBadge status={sample.status} />
                        {notice && (
                          <span
                            title={INVOICE_NOTICE_LABELS[notice].hint}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                              notice === "CANCELLED"
                                ? "bg-rose-50 text-rose-700 ring-rose-200"
                                : "bg-amber-50 text-amber-700 ring-amber-200"
                            }`}
                          >
                            {INVOICE_NOTICE_LABELS[notice].title}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {sample.produit ? `${sample.produit} · ` : ""}
                        {formatDate(sample.sampledAt)}
                      </p>
                    </div>
                    {sample.report && (
                      <a
                        href={`/api/samples/${sample.id}/report`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg px-2 py-1 font-mono text-xs font-semibold text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        {amendedNumber(sample.report.number, sample.report.version)}
                      </a>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Factures
            </h2>
            {invoices.length === 0 ? (
              <Empty>Aucune facture pour ce client.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {invoices.map((invoice) => {
                  const { state } = invoiceFigures({
                    status: invoice.status,
                    kind: invoice.kind,
                    total: invoice.total,
                    payments: invoice.payments.map((payment) => payment.amount),
                    creditNotes: invoice.creditNotes.map((note) => note.total),
                  });
                  return (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link
                      href={invoiceHref(invoice.id)}
                      target={session.role === "ADMIN" ? undefined : "_blank"}
                      className="min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <p className="font-mono text-sm font-semibold text-slate-900">
                        {documentLabel(invoice)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(invoice.issueDate)}
                      </p>
                    </Link>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${
                          state === "ANNULEE"
                            ? "text-slate-400 line-through decoration-slate-300"
                            : state === "BROUILLON"
                              ? "text-slate-500"
                              : "text-slate-900"
                        }`}
                      >
                        {state === "AVOIR" ? "− " : ""}
                        {formatCurrency(toMoney(invoice.total))}
                      </p>
                      <p className="mt-0.5">
                        <InvoiceStateBadge state={state} size="sm" />
                      </p>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {session.role === "ADMIN" && !client.archived && (
            <ClientMergeActions clientId={client.id} clientName={client.name} />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">
          {children}
        </dd>
      </div>
    </div>
  );
}

function Missing() {
  return <span className="text-slate-400">Non renseigné</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}
