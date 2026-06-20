import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export function Card({ children, className = "", hover = false }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${
        hover ? "transition-shadow hover:shadow-md" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
