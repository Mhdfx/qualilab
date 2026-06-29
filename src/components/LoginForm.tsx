"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, ShieldCheck } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { BrandLogo } from "@/components/BrandLogo";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Connexion impossible.");
        return;
      }

      router.push(data.redirect);
      router.refresh();
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-brand-light/40 p-3 sm:p-4">
      <div className="relative z-10 flex w-full max-w-[920px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 sm:rounded-3xl sm:min-h-[540px]">
        <div className="flex w-full flex-col justify-center px-5 py-8 sm:px-12 sm:py-10 md:w-[55%]">
          <div className="mb-8 sm:mb-10">
            <BrandLogo />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-brand sm:text-3xl">Connexion</h1>
          <p className="mb-8 text-sm text-slate-500">
            Accédez à votre espace Qualilab International
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <p className="text-center text-xs text-slate-400">
              Utilisez votre identifiant professionnel
            </p>

            <div className="relative">
              <User
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="login-username"
                type="text"
                name="qualilab-username"
                placeholder="Nom d'utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="input-field w-full py-3.5 pl-12 pr-4 text-base sm:text-sm"
                required
              />
            </div>

            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="login-password"
                type="password"
                name="qualilab-password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="input-field w-full py-3.5 pl-12 pr-4 text-base sm:text-sm"
                required
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2.5 text-center text-sm text-red-600 ring-1 ring-red-100">
                {error}
              </p>
            )}

            <PrimaryButton
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] py-3.5 text-sm font-bold tracking-widest"
            >
              {loading ? "CONNEXION..." : "SE CONNECTER"}
            </PrimaryButton>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            Démo : <span className="font-medium text-slate-500">pre1</span> /{" "}
            <span className="font-medium text-slate-500">admin</span> — mot de passe{" "}
            <span className="font-medium text-slate-500">password</span>
          </p>
        </div>

        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#1a3a5c] via-[#234b73] to-[#2d6a9f] md:flex md:w-[45%] md:flex-col md:items-center md:justify-center md:px-10 md:text-center">
          <div className="absolute -left-6 top-10 h-16 w-16 rotate-45 border border-white/15" />
          <div className="absolute right-8 top-20 h-10 w-10 rounded-full border border-white/15" />
          <div className="absolute bottom-16 left-12 h-0 w-0 border-l-[30px] border-r-[30px] border-b-[52px] border-l-transparent border-r-transparent border-b-white/10" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.1)_0%,transparent_50%)]" />

          <div className="relative z-10">
            <BrandLogo variant="onDark" />
          </div>
          <p className="relative z-10 mt-6 max-w-xs text-sm leading-relaxed text-white/90">
            Laboratoire d&apos;analyses agroalimentaire, eaux &amp; environnement de
            travail — système LIMS intégré.
          </p>
          <div className="relative z-10 mt-8 w-full max-w-xs space-y-3 text-left">
            {[
              "Contrôle alimentaire",
              "Analyses eau potable",
              "Hygiène des ambiances",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 rounded-xl bg-white/10 px-4 py-2.5 text-xs text-white/85 backdrop-blur-sm"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-white/70" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
