"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import type { StoryScrollerProps } from "@/components/landing/story-scroller.types";
import { cssVars } from "@/lib/css-vars";
import { cn } from "@/lib/utils";

/*
 * One worked example told in steps. On wide screens the picture stays pinned
 * beside the text and changes as each step scrolls past; on narrow screens
 * every picture sits under its own step. Each picture is rendered once, so
 * assistive technology reads the story in order at every size.
 */
export function StoryScroller({ steps }: StoryScrollerProps) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.step));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const node of stepRefs.current) {
      if (node) {
        observer.observe(node);
      }
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-x-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {steps.map((step, index) => (
        <Fragment key={step.title}>
          <div
            ref={(node) => {
              stepRefs.current[index] = node;
            }}
            data-step={index}
            className={cn(
              "flex flex-col gap-4 pt-16 pb-8 first:pt-0 md:col-start-1 md:min-h-[78vh] md:justify-center md:py-0 md:first:pt-0",
            )}
          >
            <p className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 place-items-center rounded-full border text-sm tabular-nums transition-colors duration-500",
                  active === index && "md:border-primary md:bg-primary md:text-primary-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="sr-only">
                Step {index + 1} of {steps.length}
              </span>
            </p>
            <h3 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance md:text-[2.25rem]">
              {step.title}
            </h3>
            <p className="max-w-[42ch] text-lg text-pretty text-muted-foreground">{step.body}</p>
          </div>
          <div
            data-active={active === index ? "" : undefined}
            className={cn(
              "story-panel cover relative isolate overflow-hidden rounded-3xl p-5 sm:p-8",
              "md:sticky md:top-[calc(50dvh-17.5rem)] md:col-start-2 md:row-span-3 md:row-start-1 md:flex md:h-[35rem] md:items-center md:self-start",
              "md:transition-[opacity,transform] md:duration-700 md:ease-out-expo",
              active === index
                ? "md:z-10 md:opacity-100"
                : "md:pointer-events-none md:translate-y-3 md:scale-[0.985] md:opacity-0",
            )}
            style={cssVars({ "--h": step.hue })}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 400 300"
              preserveAspectRatio="xMidYMid slice"
              className="pointer-events-none absolute inset-0 -z-10 size-full"
            >
              <g transform="rotate(-16 200 150)">
                <ellipse className="cover-ring" cx="200" cy="150" rx="250" ry="120" />
                <ellipse className="cover-ring" cx="200" cy="150" rx="170" ry="80" />
              </g>
            </svg>
            <div className="w-full">{step.visual}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
