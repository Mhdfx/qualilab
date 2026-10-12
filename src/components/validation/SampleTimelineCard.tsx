import { Card } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/labels";
import type { TimelineEvent, TimelineTone } from "@/lib/sample-timeline";

const DOT: Record<TimelineTone, string> = {
  neutral: "bg-slate-300 ring-slate-100",
  success: "bg-emerald-500 ring-emerald-100",
  warning: "bg-amber-500 ring-amber-100",
  danger: "bg-rose-500 ring-rose-100",
};

/** The tone in words, for whoever cannot see the colour of the dot. */
const TONE_WORDS: Record<TimelineTone, string | null> = {
  neutral: null,
  success: null,
  warning: "à noter",
  danger: "important",
};

/**
 * « Parcours de l'échantillon » — every recorded step, oldest first, with its
 * date (laboratory time), its author and its note. Server-rendered from
 * `sampleTimelineFor` (src/lib/sample-timeline-server.ts).
 */
export function SampleTimelineCard({ events, truncated }: { events: TimelineEvent[]; truncated: boolean }) {
  return (
    <Card className="p-5">
      <h2 id="parcours-title" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Parcours de l&apos;échantillon
      </h2>
      {truncated && (
        <p className="mt-2 text-xs text-slate-500">Les 100 dernières étapes du journal sont affichées ; l&apos;historique complet est dans le journal d&apos;audit.</p>
      )}
      <ol aria-labelledby="parcours-title" className="mt-4">
        {events.map((event, index) => {
          const last = index === events.length - 1;
          const toneWord = TONE_WORDS[event.tone];
          return (
            <li key={event.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && <span aria-hidden="true" className="absolute left-[5px] top-4 h-[calc(100%-0.75rem)] w-px bg-slate-200" />}
              <span aria-hidden="true" className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ${DOT[event.tone]}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {event.label}
                  {toneWord && <span className="sr-only"> ({toneWord})</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  <time dateTime={event.at.toISOString()}>{formatDateTime(event.at)}</time>
                  {event.actor && <> · {event.actor}</>}
                </p>
                {event.note && <p className="mt-0.5 break-words text-xs text-slate-600">{event.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
