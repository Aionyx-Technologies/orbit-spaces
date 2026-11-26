import {
  CheckIcon,
  EyeOffIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  SparklesIcon,
  TriangleAlertIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { AssistantMark } from "@/components/brand/assistant-mark";
import { LogoMark } from "@/components/brand/logo";
import { ExampleSpaces } from "@/components/landing/example-spaces";
import type { HowItWorksProps } from "@/components/landing/how-it-works.types";
import { Pricing } from "@/components/landing/pricing";
import { StoryScroller } from "@/components/landing/story-scroller";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { sourceTone, toneVars } from "@/lib/assistants";
import { cssVars } from "@/lib/css-vars";
import { cn } from "@/lib/utils";

const SHARES = [
  {
    person: "Alex",
    assistant: "ChatGPT",
    ask: "Share the flight times to Orbit.",
    offset: "sm:mr-16",
  },
  {
    person: "Blake",
    assistant: "Grok",
    ask: "Add our budget to Orbit: $3,000 for the whole trip.",
    offset: "sm:mx-8",
  },
  {
    person: "Priya",
    assistant: "Claude",
    ask: "Put my hotel shortlist in our Vegas space.",
    offset: "sm:ml-16",
  },
] as const;

const FEED = [
  {
    title: "Morning flight, Dec 20",
    detail: "Lands in Las Vegas at 10:40.",
    person: "Alex",
    assistant: "ChatGPT",
    when: "2 hours ago",
  },
  {
    title: "Budget",
    detail: "$3,000 for the whole trip",
    person: "Blake",
    assistant: "Grok",
    when: "yesterday",
  },
  {
    title: "Hotel shortlist",
    detail: "Three places on the Strip, each under $250 a night.",
    person: "Priya",
    assistant: "Claude",
    when: "20 minutes ago",
  },
] as const;

const PROMISES: readonly (readonly [LucideIcon, string, string])[] = [
  [
    EyeOffIcon,
    "Orbit never reads your chats or what your assistant remembers about you.",
    "Only what someone names goes in. The rest of the conversation stays between you and your assistant.",
  ],
  [
    Undo2Icon,
    "Nothing goes in unless someone asks to share it, and you can take it back.",
    "Take back anything you shared at any time, from your assistant or on the web.",
  ],
  [
    SparklesIcon,
    "Anything Orbit writes is labelled, so it is never mistaken for a person.",
    "Where people disagree, Orbit lists the question to settle instead of quietly picking a side.",
  ],
];

const TEMPLATES = [
  "✈️ Trip",
  "🎁 Holiday gifts",
  "🏠 Household",
  "🍽️ Dinner party",
  "🎉 Event",
  "💼 Client project",
  "👥 Team project",
];

const CONNECT = ["ChatGPT", "Claude", "Grok", "Muse", "OpenClaw", "Hermes Agent"] as const;

export function HowItWorks({ billingEnabled = false }: HowItWorksProps) {
  return (
    <>
      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="mx-auto w-full max-w-6xl scroll-mt-8 px-6 py-24 sm:py-32"
      >
        <header className="flex max-w-3xl flex-col gap-5 pb-16 md:pb-8">
          <h2
            id="how-it-works-title"
            className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-6xl"
          >
            Three friends, three assistants, one trip
          </h2>
          <p className="max-w-2xl text-lg text-pretty text-muted-foreground md:text-xl">
            Alex plans in ChatGPT, Blake in Grok and Priya in Claude. Here is how a weekend in Vegas
            comes together in one Orbit space without anyone copying and pasting.
          </p>
        </header>

        <StoryScroller
          steps={[
            {
              title: "Say “share this to Orbit”",
              body: "Ask your assistant in your own words. Only what you name goes into the space. The rest of the conversation stays between you and your assistant.",
              hue: 172,
              visual: <ShareVisual />,
            },
            {
              title: "Every assistant reads the same space",
              body: "When Blake asks Grok what is new, Grok reads only what the group shared, and every line says who shared it, from which assistant and when. Friends without an assistant can read and reply on the web.",
              hue: 277,
              visual: <SpaceVisual />,
            },
            {
              title: "Ask Orbit to pull it together",
              body: "One press turns everything shared into a single plan, marked as written by Orbit. Where people disagree, Orbit does not quietly pick a side. It lists the question under To settle.",
              hue: 70,
              visual: <PlanVisual />,
            },
          ]}
        />
      </section>

      <ExampleSpaces />

      <section
        aria-labelledby="join-title"
        className="mx-auto w-full max-w-6xl px-6 pb-24 sm:pb-32"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-16">
          <h2
            id="join-title"
            className="text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-5xl"
          >
            Bring everyone in
          </h2>
          <p className="max-w-md text-lg text-pretty text-muted-foreground">
            The people you invite join from a link, whichever assistant they use, with nothing to
            install.
          </p>
        </div>
        <ol className="mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
          <JoinStep
            index={1}
            title="Open a space"
            body="Describe it in a sentence and Orbit suggests a name, description and facts, or start from a template."
          >
            <ul aria-label="Templates" className="flex flex-wrap gap-2">
              {TEMPLATES.map((template) => (
                <li
                  key={template}
                  className="rounded-full border bg-card px-3 py-1.5 text-sm shadow-card"
                >
                  {template}
                </li>
              ))}
            </ul>
          </JoinStep>
          <JoinStep
            index={2}
            title="Invite by link or email"
            body="Send a link to anyone. Email invites wait under Pending spaces until the person says yes."
          >
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-card">
                <LinkIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="truncate text-muted-foreground">Invite link for Vegas trip</span>
              </p>
              <p className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-card">
                <MailIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="truncate text-muted-foreground">priya@example.com · pending</span>
              </p>
            </div>
          </JoinStep>
          <JoinStep
            index={3}
            title="Add Orbit to each assistant"
            body="Each person adds Orbit to their own assistant once. Copy the setup prompt at the top of this page into your assistant and it walks you through the rest. No assistant? Read and reply on the web."
          >
            <ul aria-label="Assistants with a guide" className="flex flex-wrap items-center gap-2">
              {CONNECT.map((name) => (
                <li
                  key={name}
                  className="grid size-10 place-items-center rounded-full border bg-card shadow-card"
                >
                  <AssistantMark name={name} className="size-5" />
                  <span className="sr-only">{name}</span>
                </li>
              ))}
              <li className="grid size-10 place-items-center rounded-full border border-dashed bg-card">
                <GlobeIcon aria-hidden="true" className="size-5 text-muted-foreground" />
                <span className="sr-only">On the web</span>
              </li>
            </ul>
          </JoinStep>
        </ol>
      </section>

      <section aria-labelledby="promises-title" className="px-6 pb-24 sm:pb-32">
        <div className="promise-band mx-auto grid w-full max-w-6xl gap-12 rounded-[2rem] px-6 py-16 sm:px-12 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] md:gap-16 md:px-16 md:py-24">
          <div className="flex flex-col gap-6 md:sticky md:top-24 md:self-start">
            <h2
              id="promises-title"
              className="text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-5xl"
            >
              Orbit only knows what you hand it
            </h2>
            <p className="flex items-center gap-3 rounded-xl border border-current/15 px-4 py-3 text-sm">
              <LockIcon aria-hidden="true" className="size-4 shrink-0 opacity-70" />
              <span className="promise-muted">
                Your chats, your assistant&rsquo;s memory and your drafts are never in a space.
              </span>
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-current/15">
            {PROMISES.map(([Icon, text, detail]) => (
              <li key={text} className="flex gap-5 py-8 first:pt-0 last:pb-0">
                <span className="promise-icon grid size-11 shrink-0 place-items-center rounded-full">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="flex flex-col gap-2">
                  <p className="text-xl leading-snug font-medium tracking-[-0.01em] text-pretty md:text-2xl">
                    {text}
                  </p>
                  <p className="promise-muted text-pretty">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Pricing billingEnabled={billingEnabled} />

      <section
        aria-labelledby="start-title"
        className="mx-auto w-full max-w-6xl px-6 pb-24 sm:pb-32"
      >
        <div className="cover relative isolate flex flex-col items-center gap-7 overflow-hidden rounded-[2rem] px-6 py-20 text-center sm:py-28">
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 800 400"
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none absolute inset-0 -z-10 size-full"
          >
            <g transform="rotate(-12 400 200)">
              <ellipse className="cover-ring" cx="400" cy="200" rx="470" ry="190" />
              <ellipse className="cover-ring" cx="400" cy="200" rx="330" ry="130" />
              <ellipse className="cover-ring" cx="400" cy="200" rx="200" ry="80" />
            </g>
          </svg>
          <LogoMark className="size-12" />
          <h2
            id="start-title"
            className="max-w-2xl text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-6xl"
          >
            Start a space, invite anyone
          </h2>
          <p className="max-w-lg text-lg text-pretty text-muted-foreground">
            Plan the trip, the gifts, the house or the client work together, each of you in the
            assistant you already use, or on the web.
          </p>
          <a href="/auth/sign-in?next=/spaces" className={buttonVariants({ size: "lg" })}>
            Start a space
          </a>
        </div>
      </section>
    </>
  );
}

function JoinStep({
  index,
  title,
  body,
  children,
}: Readonly<{ index: number; title: string; body: string; children: ReactNode }>) {
  return (
    <li className="flex flex-col gap-4 border-t pt-6">
      <p className="text-sm font-medium text-muted-foreground tabular-nums">
        <span aria-hidden="true">{index}</span>
        <span className="sr-only">Step {index}</span>
      </p>
      <h3 className="heading-section">{title}</h3>
      <p className="text-pretty text-muted-foreground">{body}</p>
      <div className="mt-2">{children}</div>
    </li>
  );
}

function ShareVisual() {
  return (
    <ol aria-label="Three people sharing from their assistants" className="flex flex-col gap-4">
      {SHARES.map((share, index) => (
        <li
          key={share.person}
          className={cn(
            "story-in flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card",
            share.offset,
          )}
          style={cssVars({ "--i": index })}
        >
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <AssistantMark name={share.assistant} className="size-5" />
            {share.person} in {share.assistant}
          </p>
          <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[0.9375rem] text-primary-foreground">
            {share.ask}
          </p>
          <p
            className="source-soft inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-sm font-medium"
            style={cssVars(toneVars(sourceTone(share.assistant)))}
          >
            <CheckIcon aria-hidden="true" className="size-4" />
            Shared to Vegas trip
          </p>
        </li>
      ))}
    </ol>
  );
}

function SpaceVisual() {
  return (
    <div className="relative sm:pt-8">
      <p className="story-in relative z-10 mb-3 ml-auto flex w-fit max-w-[85%] items-center gap-2 rounded-2xl rounded-br-md border bg-card px-3.5 py-2 text-[0.9375rem] shadow-lift sm:absolute sm:top-0 sm:right-4 sm:mb-0 sm:max-w-[80%]">
        <AssistantMark name="Grok" className="size-5 shrink-0" />
        What is new in Vegas trip?
      </p>
      <div className="rounded-xl border bg-card p-5 shadow-lift">
        <div className="flex items-center justify-between gap-3 pb-4">
          <p className="heading-card">Vegas trip</p>
          <p className="flex items-center -space-x-1.5" role="img" aria-label="3 members">
            {SHARES.map((share) => (
              <span
                key={share.person}
                aria-hidden="true"
                className="source grid size-7 place-items-center rounded-full text-xs font-semibold text-white ring-2 ring-card"
                style={cssVars(toneVars(sourceTone(share.assistant)))}
              >
                {share.person[0]}
              </span>
            ))}
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {FEED.map((item, index) => (
            <li
              key={item.title}
              className="story-in source-rail rounded-lg border bg-background/60 py-3 pr-4 pl-5"
              style={cssVars({ ...toneVars(sourceTone(item.assistant)), "--i": index + 1 })}
            >
              <p className="font-semibold">{item.title}</p>
              <p className="text-[0.9375rem] text-muted-foreground">{item.detail}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <AssistantMark name={item.assistant} className="size-4" />
                {item.person} via {item.assistant} · {item.when}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PlanVisual() {
  return (
    <article
      aria-label="A plan written by Orbit"
      className="ai-frame flex flex-col gap-4 rounded-xl p-5 shadow-lift sm:p-6"
    >
      <Badge className="self-start">
        <SparklesIcon aria-hidden="true" />
        Written by Orbit
      </Badge>
      <p className="heading-section">Vegas trip plan</p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem] marker:text-primary">
        <li className="story-in" style={cssVars({ "--i": 1 })}>
          Fly in on the morning of Dec 20, on Alex&rsquo;s flight.
        </li>
        <li className="story-in" style={cssVars({ "--i": 2 })}>
          Stay on the Strip, at one of Priya&rsquo;s three hotels.
        </li>
        <li className="story-in" style={cssVars({ "--i": 3 })}>
          Keep the whole trip within Blake&rsquo;s $3,000.
        </li>
      </ul>
      <div
        className="story-in rounded-lg bg-ember-soft p-4 text-ember-text"
        style={cssVars({ "--i": 4 })}
      >
        <p className="flex items-center gap-2 font-semibold">
          <TriangleAlertIcon aria-hidden="true" className="size-4" />
          To settle
        </p>
        <p className="mt-1 text-[0.9375rem]">
          Alex lands on Dec 20, but the hotels Priya shared only have rooms from Dec 21.
        </p>
      </div>
    </article>
  );
}
