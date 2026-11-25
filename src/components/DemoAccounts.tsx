"use client";

import { useState } from "react";
import { ChevronDown, Copy, Check, LogIn } from "lucide-react";
import { ROLES, ROLE_LABELS } from "@/lib/roles";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, demoModeEnabled } from "@/lib/demo-accounts";

/**
 * Demo accounts panel — a testing aid for the demonstration phase.
 *
 * Hidden by setting NEXT_PUBLIC_DEMO_MODE=false, which is what production
 * must do once the laboratory's real accounts exist: this panel lists working
 * credentials and has no place in front of real users.
 *
 * Only the accounts the database holds and has not disabled are listed
 * (`available`, read by the login page, demo-accounts-server.ts): an account
 * the panel offers must be one that can sign in. None available, no panel.
 */

// Fails the build if a role ever loses its demo account.
const COVERED = new Set(DEMO_ACCOUNTS.map((a) => a.role));
// CLIENT (portal, PORTAIL.md) deliberately has no demo account: a portal
// account belongs to one client, so the admin creates it in /admin/utilisateurs.
const MISSING = ROLES.filter((role) => role !== "CLIENT" && !COVERED.has(role));

type DemoAccountsProps = {
  /** The demo usernames that can sign in (the login page asks the database). */
  available: readonly string[];
  /** Fills the login form with the chosen account. */
  onPick: (username: string, password: string) => void;
};

export function DemoAccounts({ available, onPick }: DemoAccountsProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!demoModeEnabled()) return null;
  const accounts = DEMO_ACCOUNTS.filter((account) => available.includes(account.username));
  if (accounts.length === 0) return null;

  function copy(username: string) {
    navigator.clipboard?.writeText(username);
    setCopied(username);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Comptes de démonstration
          <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {accounts.length}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-slate-200 p-2.5">
          <p className="mb-2 px-1 text-[11px] text-slate-500">
            Mot de passe commun :{" "}
            <span className="font-mono font-semibold text-slate-700">
              {DEMO_PASSWORD}
            </span>{" "}
            · cliquez sur un compte pour remplir le formulaire.
          </p>

          <ul className="space-y-1">
            {accounts.map((account) => (
              <li key={account.username} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPick(account.username, DEMO_PASSWORD)}
                  className="group flex min-h-[38px] flex-1 items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left ring-1 ring-slate-200 transition hover:ring-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-xs font-semibold text-slate-900">
                      {account.username}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {ROLE_LABELS[account.role]} · {account.name}
                    </span>
                  </span>
                  <LogIn
                    className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-brand"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => copy(account.username)}
                  aria-label={`Copier ${account.username}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {copied === account.username ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {MISSING.length > 0 && (
            <p className="mt-2 px-1 text-[11px] text-amber-700">
              Rôles sans compte de démonstration : {MISSING.join(", ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
