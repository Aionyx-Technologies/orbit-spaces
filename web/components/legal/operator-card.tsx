import type { OperatorCardProps } from "@/components/legal/operator-card.types";
import { hasOperatorDetails } from "@/lib/operator";

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OperatorCard({ details }: OperatorCardProps) {
  if (!hasOperatorDetails(details)) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-base text-muted-foreground">
        The person who runs this Orbit has not added their details yet. Ask them who they are and
        where your data is stored before you share anything.
      </p>
    );
  }
  return (
    <dl className="grid gap-x-4 gap-y-2 rounded-xl border bg-card p-4 text-base sm:grid-cols-[12rem_1fr]">
      {details.name ? (
        <>
          <dt className="font-medium">Run by</dt>
          <dd>{details.name}</dd>
        </>
      ) : null}
      {details.contact ? (
        <>
          <dt className="font-medium">Contact</dt>
          <dd>
            {EMAIL_ADDRESS.test(details.contact) ? (
              <a href={`mailto:${details.contact}`} className="underline underline-offset-4">
                {details.contact}
              </a>
            ) : (
              details.contact
            )}
          </dd>
        </>
      ) : null}
      {details.dataLocation ? (
        <>
          <dt className="font-medium">Where your data is stored</dt>
          <dd>{details.dataLocation}</dd>
        </>
      ) : null}
    </dl>
  );
}
