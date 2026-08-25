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
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatCurrency, INVOICE_STATUS_LABELS } from "@/lib/labels";
import { toMoney } from "@/lib/money";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";

/**
 * Fiche client 360° — everything the laboratory knows about one client on a
 * single screen: who they are, who receives their mail, their samples, their
 * reports and their invoices.
 */
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("GESTIONNAIRE", "ADMIN");
  const { id } = await params;

  const [client, samples, invoices, paid] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: { emails: { orderBy: { email: "asc" } } },
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
        report: { select: { number: true, sentAt: true } },
      },
      orderBy: { sampledAt: "desc" },
      take: 25,
    }),
    prisma.invoice.findMany({
      where: { clientId: id },
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        total: true,
      },
      orderBy: { issueDate: "desc" },
      take: 25,
    }),
    prisma.invoice.aggregate({
      where: { clientId: id, status: "PAYEE" },
      _sum: { total: true },
    }),
  ]);

  if (!client) notFound();

  const billed = invoices.reduce((sum, invoice) => sum + toMoney(invoice.total), 0);
  const reports = samples.filter((sample) => sample.report).length;

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

      {client.archived && (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
          Ce client est archivé : il n&apos;apparaît plus dans les listes de
          sélection, mais son historique reste consultable.
        </p>
      )}

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Échantillons" value={samples.length} icon={FlaskConical} accent="blue" />
          <StatCard label="Rapports" value={reports} icon={FileText} accent="emerald" />
          <StatCard label="Facturé" value={formatCurrency(billed)} icon={FileText} accent="brand" />
          <StatCard label="Encaissé" value={formatCurrency(toMoney(paid._sum.total))} icon={FileText} accent="violet" />
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
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Échantillons récents
            </h2>
            {samples.length === 0 ? (
              <Empty>Aucun échantillon pour ce client.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {samples.map((sample) => (
                  <li key={sample.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono font-semibold text-slate-900">
                          {sample.controlCode ?? sample.code}
                        </span>
                        <TypeBadge type={sample.type} />
                        <StatusBadge status={sample.status} />
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
                        {sample.report.number}
                      </a>
                    )}
                  </li>
                ))}
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
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link
                      href={`/admin/factures/${invoice.id}`}
                      className="min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <p className="font-mono text-sm font-semibold text-slate-900">
                        {invoice.number}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(invoice.issueDate)}
                      </p>
                    </Link>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(toMoney(invoice.total))}
                      </p>
                      <p
                        className={`mt-0.5 text-[11px] font-medium ${
                          invoice.status === "PAYEE"
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }`}
                      >
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
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
