import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

const baseClass =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#234b73] to-[#1a3a5c] px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-md shadow-brand/25 transition-all hover:from-[#2d6a9f] hover:to-[#1a3a5c] hover:shadow-lg hover:shadow-brand/30 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100";

export function PrimaryLink({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof Link>) {
  return <Link {...props} className={`${baseClass} ${className}`} />;
}

export function PrimaryButton({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button">) {
  return <button {...props} className={`${baseClass} ${className}`} />;
}

export function SecondaryButton({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60 ${className}`}
    />
  );
}
