import { Fragment } from "react";

import type { InlineTextProps, PlanTextProps } from "@/components/space/plan-text.types";
import { parsePlan, splitBold } from "@/lib/plan-format";
import { cn } from "@/lib/utils";

function InlineText({ text }: InlineTextProps) {
  return (
    <>
      {splitBold(text).map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-semibold">
            {segment.text}
          </strong>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

export function PlanText({ text, sections, className }: PlanTextProps) {
  const blocks = parsePlan(text, sections);
  return (
    <div className={cn("flex flex-col gap-3 text-base leading-relaxed break-words", className)}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <h3
              key={index}
              className="mt-2 text-sm font-semibold tracking-wide text-primary uppercase first:mt-0"
            >
              <InlineText text={block.text} />
            </h3>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={index} className="list-disc space-y-1.5 pl-5 marker:text-primary">
              {block.items.map((item, position) => (
                <li key={position}>
                  <InlineText text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="whitespace-pre-line">
            <InlineText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
