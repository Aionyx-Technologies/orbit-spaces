"use client";

import { GlobeIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { AssistantMark } from "@/components/brand/assistant-mark";
import type { Example, ExampleShare } from "@/components/landing/example-spaces.types";
import { Badge } from "@/components/ui/badge";
import { sourceTone, toneVars } from "@/lib/assistants";
import { cssVars } from "@/lib/css-vars";
import { cn } from "@/lib/utils";

export const EXAMPLES: readonly Example[] = [
  {
    id: "trip",
    chip: "Trip",
    icon: "✈️",
    group: "Life",
    space: "Lisbon long weekend",
    shares: [
      {
        title: "Flights land Friday at 9:10",
        person: "Ana",
        source: "ChatGPT",
        when: "2 hours ago",
      },
      { title: "Budget: €600 each", person: "Tom", source: "web", when: "yesterday" },
      {
        title: "Two apartments in Alfama",
        person: "Kai",
        source: "Claude",
        when: "20 minutes ago",
      },
    ],
    orbit: { kind: "settle", text: "Kai's apartments may not fit Tom's €600 budget." },
  },
  {
    id: "holiday-gifts",
    chip: "Holiday gifts",
    icon: "🎁",
    group: "Life",
    space: "Family Christmas",
    shares: [
      { title: "Getting Leo the Lego set", person: "Sam", source: "ChatGPT", when: "1 hour ago" },
      { title: "Budget: £40 each", person: "Dad", source: "web", when: "yesterday" },
      { title: "Lego set for Leo", person: "Lena", source: "Claude", when: "10 minutes ago" },
    ],
    orbit: { kind: "settle", text: "Sam and Lena both plan to buy Leo the Lego set." },
  },
  {
    id: "household",
    chip: "Household",
    icon: "🏠",
    group: "Life",
    space: "Flat 4B",
    shares: [
      { title: "Milk, eggs and oat milk", person: "Jo", source: "Grok", when: "30 minutes ago" },
      { title: "Rent due on the 1st", person: "Mia", source: "web", when: "2 days ago" },
      { title: "Bins go out on Tuesdays", person: "Ravi", source: "ChatGPT", when: "yesterday" },
    ],
    orbit: {
      kind: "plan",
      text: "One shopping list, with rent due on the 1st and bins on Tuesday.",
    },
  },
  {
    id: "dinner-party",
    chip: "Dinner party",
    icon: "🍽️",
    group: "Life",
    space: "Friday supper",
    shares: [
      { title: "I'll bring dessert", person: "Nina", source: "Claude", when: "3 hours ago" },
      { title: "I'm vegan", person: "Dev", source: "web", when: "yesterday" },
      { title: "Main course: lasagne", person: "Omar", source: "ChatGPT", when: "1 hour ago" },
    ],
    orbit: { kind: "settle", text: "The lasagne needs a vegan option for Dev." },
  },
  {
    id: "event",
    chip: "Event",
    icon: "🎉",
    group: "Life",
    space: "Leo's 30th",
    shares: [
      { title: "The venue holds 40", person: "Priya", source: "Claude", when: "yesterday" },
      { title: "32 people said yes", person: "Leo's mum", source: "web", when: "4 hours ago" },
      { title: "DJ quote: £300", person: "Alex", source: "Grok", when: "1 hour ago" },
    ],
    orbit: { kind: "plan", text: "32 guests fit the 40-person venue, and the DJ quote is in." },
  },
  {
    id: "freelancer-client",
    chip: "Client project",
    icon: "💼",
    group: "Work",
    space: "Café rebrand",
    shares: [
      { title: "Logo, round 2", person: "Maya", source: "Claude", when: "2 hours ago" },
      {
        title: "Warmer colours, launch March 1",
        person: "Lee (client)",
        source: "web",
        when: "1 hour ago",
      },
      { title: "Site ready by March 15", person: "Jon", source: "ChatGPT", when: "yesterday" },
    ],
    orbit: {
      kind: "settle",
      text: "Lee wants to launch on March 1, but the site is ready on March 15.",
    },
  },
  {
    id: "team-project",
    chip: "Team project",
    icon: "👥",
    group: "Work",
    space: "Spring launch",
    shares: [
      {
        title: "Landing page copy is ready",
        person: "Sara",
        source: "ChatGPT",
        when: "3 hours ago",
      },
      { title: "QA sign-off on Thursday", person: "Ben", source: "Claude", when: "1 hour ago" },
      { title: "Press list", person: "Ola", source: "web", when: "yesterday" },
    ],
    orbit: {
      kind: "plan",
      text: "Copy is ready, QA signs off Thursday, then the press list goes out.",
    },
  },
];

const GROUPS = ["Life", "Work"] as const;

export function ExampleSpaces() {
  const [selectedId, setSelectedId] = useState(EXAMPLES[0].id);
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const selected = EXAMPLES.find((example) => example.id === selectedId) ?? EXAMPLES[0];

  function select(index: number) {
    const next = EXAMPLES[(index + EXAMPLES.length) % EXAMPLES.length];
    setSelectedId(next.id);
    tabs.current.get(next.id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = EXAMPLES.findIndex((example) => example.id === selectedId);
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: EXAMPLES.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    select(target);
  }

  return (
    <section
      aria-labelledby="examples-title"
      className="mx-auto w-full max-w-6xl px-6 pb-24 sm:pb-32"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-16">
        <h2
          id="examples-title"
          className="text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-5xl"
        >
          What will you plan together?
        </h2>
        <p className="max-w-md text-lg text-pretty text-muted-foreground">
          Every space works the same way. Pick one to see it.
        </p>
      </div>

      <div className="mt-14 grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
        <div role="tablist" aria-label="Example spaces" className="flex flex-col gap-5">
          {GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-2.5">
              <span aria-hidden="true" className="text-sm font-medium text-muted-foreground">
                {group}
              </span>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.filter((example) => example.group === group).map((example) => {
                  const isSelected = example.id === selected.id;
                  return (
                    <button
                      key={example.id}
                      ref={(node) => {
                        if (node) {
                          tabs.current.set(example.id, node);
                        } else {
                          tabs.current.delete(example.id);
                        }
                      }}
                      type="button"
                      role="tab"
                      id={`example-tab-${example.id}`}
                      aria-controls="example-panel"
                      aria-selected={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => setSelectedId(example.id)}
                      onKeyDown={onKeyDown}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm shadow-card transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        isSelected &&
                          "border-primary bg-primary/10 text-foreground hover:bg-primary/10",
                      )}
                    >
                      <span aria-hidden="true">{example.icon}</span>
                      {example.chip}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div
          key={selected.id}
          role="tabpanel"
          id="example-panel"
          aria-labelledby={`example-tab-${selected.id}`}
          className="rounded-xl border bg-card p-5 shadow-lift"
        >
          <div className="flex items-center justify-between gap-3 pb-4">
            <p className="heading-card">{selected.space}</p>
            <p
              className="flex items-center -space-x-1.5"
              role="img"
              aria-label={`${selected.shares.length} members`}
            >
              {selected.shares.map((share) => (
                <span
                  key={share.person + share.source}
                  aria-hidden="true"
                  className="source grid size-7 place-items-center rounded-full text-xs font-semibold text-white ring-2 ring-card"
                  style={cssVars(toneVars(sourceTone(share.source)))}
                >
                  {share.person[0]}
                </span>
              ))}
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {selected.shares.map((share, index) => (
              <ShareRow key={share.title} share={share} index={index} />
            ))}
          </ul>
          <OrbitLine orbit={selected.orbit} />
        </div>
      </div>
    </section>
  );
}

function ShareRow({ share, index }: Readonly<{ share: ExampleShare; index: number }>) {
  const onWeb = share.source.toLowerCase() === "web";
  return (
    <li
      className="example-in source-rail rounded-lg border bg-background/60 py-3 pr-4 pl-5"
      style={cssVars({ ...toneVars(sourceTone(share.source)), "--i": index })}
    >
      <p className="font-semibold">{share.title}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        {onWeb ? (
          <GlobeIcon aria-hidden="true" className="size-4" />
        ) : (
          <AssistantMark name={share.source} className="size-4" />
        )}
        {onWeb
          ? `${share.person} on the web · ${share.when}`
          : `${share.person} via ${share.source} · ${share.when}`}
      </p>
    </li>
  );
}

function OrbitLine({ orbit }: Readonly<{ orbit: Example["orbit"] }>) {
  return (
    <div
      className="example-in ai-frame mt-4 flex flex-col gap-3 rounded-lg p-4"
      style={cssVars({ "--i": 3 })}
    >
      <Badge className="self-start">
        <SparklesIcon aria-hidden="true" />
        Written by Orbit
      </Badge>
      {orbit.kind === "settle" ? (
        <div className="rounded-md bg-ember-soft p-3 text-ember-text">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlertIcon aria-hidden="true" className="size-4" />
            To settle
          </p>
          <p className="mt-1 text-[0.9375rem]">{orbit.text}</p>
        </div>
      ) : (
        <p className="text-[0.9375rem]">{orbit.text}</p>
      )}
    </div>
  );
}
