import type { UsageMetersProps } from "@/components/billing/usage-meters.types";
import { formatDay } from "@/lib/format";

type MeterProps = Readonly<{
  label: string;
  text: string;
  note?: string;
  hint: string;
  used: number;
  limit: number;
}>;

function Meter({ label, text, note, hint, used, limit }: MeterProps) {
  const shown = Math.min(used, limit);
  const percent = limit > 0 ? Math.round((shown / limit) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{text}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={shown}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function UsageMeters({
  aiUses,
  instantEmails,
  aiPackCredits = 0,
  emailPackCredits = 0,
}: UsageMetersProps) {
  return (
    <div className="flex flex-col gap-3">
      {aiUses.limit !== null ? (
        <Meter
          label="AI uses used"
          text={`${aiUses.remaining ?? 0} of ${aiUses.limit} AI uses left`}
          note={`Resets ${formatDay(aiUses.resets_at)}`}
          hint="One AI use is one Combine, or one space set up from a sentence."
          used={aiUses.used}
          limit={aiUses.limit}
        />
      ) : null}
      {instantEmails ? (
        <Meter
          label="Instant emails used today"
          text={`${instantEmails.used} of ${instantEmails.limit} instant emails used today`}
          hint="Instant emails tell you when someone adds to a space. Past the limit, updates wait for the morning summary."
          used={instantEmails.used}
          limit={instantEmails.limit}
        />
      ) : null}
      {aiPackCredits > 0 ? (
        <p className="text-sm text-muted-foreground">AI pack uses: {aiPackCredits}</p>
      ) : null}
      {emailPackCredits > 0 ? (
        <p className="text-sm text-muted-foreground">Email credits: {emailPackCredits}</p>
      ) : null}
    </div>
  );
}
