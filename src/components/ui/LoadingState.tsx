export function LoadingState({ label = "Chargement..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-6 py-16 shadow-sm">
      <div className="mb-4 flex gap-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand" />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
