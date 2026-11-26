import {
  ArrowUpRightIcon,
  BellIcon,
  BrainIcon,
  CommandIcon,
  DownloadIcon,
  LayoutGridIcon,
  LayoutTemplateIcon,
  MailPlusIcon,
  MessageSquarePlusIcon,
  PlugIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AssistantMark } from "@/components/brand/assistant-mark";
import { Logo } from "@/components/brand/logo";
import { CopyButton } from "@/components/common/copy-button";
import { PolicyLinks } from "@/components/legal/policy-links";
import type { GuideFeature, SetupGuideProps } from "@/components/setup/setup-guide.types";
import { buttonVariants } from "@/components/ui/button";
import { ASSISTANT_LINKS } from "@/lib/assistant-links";
import { setupPrompt } from "@/lib/setup-prompt";

const PLACEHOLDER_URL = "https://your-orbit-address/mcp";

const SECTIONS = [
  ["prompt", "Let your assistant do it"],
  ["connect", "Connect it yourself"],
  ["sign-in", "Sign in and allow"],
  ["check", "Check that it works"],
  ["features", "What you can do in Orbit"],
] as const;

const TRY = [
  "Show my Orbit spaces.",
  "Share this to the Vegas trip space in Orbit.",
  "Remember in our Vegas trip space that the budget is $3,000.",
  "What is new in our Orbit space?",
  "Ask Orbit to pull everything in our space into one plan.",
];

const FEATURES: readonly GuideFeature[] = [
  {
    icon: LayoutGridIcon,
    title: "Spaces",
    body: "A space holds what a group shares for one thing: a trip, a project, a client. Filter your spaces by All, Yours, Shared with you or Pending, search them, sort them, and switch between grid and list. A badge shows how much is new since you last looked.",
  },
  {
    icon: MessageSquarePlusIcon,
    title: "Sharing",
    body: "Ask your assistant to share something, or type it into the share box on the web. Every item says who shared it, from which assistant and when. Take back anything you shared at any time.",
  },
  {
    icon: BrainIcon,
    title: "Shared memory",
    body: "Facts the whole group relies on, such as the budget or the dates, kept as a short list with their history. Any member's assistant can read them.",
  },
  {
    icon: SparklesIcon,
    title: "Combine",
    body: "One press turns everything shared into a single plan, labelled as written by Orbit. Where people disagree, the plan lists the question under To settle instead of picking a side.",
  },
  {
    icon: MailPlusIcon,
    title: "Invites",
    body: "Invite people by link or by email. Email invites wait under Pending spaces until the person says yes, and the Members card lets you resend or cancel them.",
  },
  {
    icon: LayoutTemplateIcon,
    title: "Templates",
    body: "Describe the space in a sentence and Orbit suggests a name, description and facts, or pick one of the eight templates: Trip, Holiday gifts, Household, Dinner party, Event, Client project, Team project or Blank. Edit it later from the space menu.",
  },
  {
    icon: DownloadIcon,
    title: "Downloads",
    body: "Download any item or the latest plan as Markdown, or export a whole space as JSON from the space menu.",
  },
  {
    icon: BellIcon,
    title: "Email updates",
    body: "Get an email as things happen, a daily summary at 8:00 in your time zone, or nothing at all. Each space has its own email switch too.",
  },
  {
    icon: PlugIcon,
    title: "Assistants",
    body: "The Assistants page has the connector address, a connect button for each assistant and the list of assistants you have connected. Revoke one there at any time.",
  },
  {
    icon: CommandIcon,
    title: "Command palette",
    body: "Press Ctrl+K, or ⌘K on a Mac, to jump to any space or page without reaching for the mouse.",
  },
  {
    icon: SettingsIcon,
    title: "Settings",
    body: "Add a photo and a few lines about yourself, pick a default space, choose light, dark or your system's theme, and sign out everywhere if you lose a device.",
  },
];

export function SetupGuide({ mcpUrl }: SetupGuideProps) {
  const address = mcpUrl ?? PLACEHOLDER_URL;
  const prompt = setupPrompt(address);

  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="Orbit home" className="rounded-md">
            <Logo className="text-sm" markClassName="size-6" />
          </Link>
          <a
            href="/auth/sign-in?next=/spaces"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Sign in
          </a>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-12 md:grid-cols-[13rem_minmax(0,1fr)] md:py-16 lg:gap-20">
        <nav aria-label="On this page" className="hidden md:block">
          <ul className="sticky top-28 flex flex-col gap-1 border-l text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-4 text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="flex max-w-3xl min-w-0 flex-col gap-20">
          <div className="flex flex-col gap-5">
            <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-6xl">
              Set up Orbit
            </h1>
            <p className="text-lg text-pretty text-muted-foreground md:text-xl">
              Connect your AI assistant to Orbit so it can share into your spaces and read what the
              others shared. Paste one prompt and your assistant does the rest, or follow the steps
              for your assistant below.
            </p>
            {mcpUrl ? null : (
              <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                This page could not reach Orbit just now, so the address below is a placeholder.
                Sign in and open Assistants to copy your real one.
              </p>
            )}
          </div>

          <GuideSection id="prompt" title="Let your assistant do it">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-pretty marker:text-muted-foreground">
              <li>Copy the setup prompt.</li>
              <li>Paste it into a new chat with ChatGPT, Claude, Grok or any other assistant.</li>
              <li>
                Follow what it says. Chat apps reply with the exact buttons to press; agents that
                can change their own settings connect Orbit themselves.
              </li>
            </ol>
            <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                <p className="text-sm font-medium">Setup prompt</p>
                <CopyButton value={prompt} label="Copy setup prompt" size="sm" />
              </div>
              <pre className="max-h-[26rem] overflow-auto px-4 py-4 text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {prompt}
              </pre>
            </div>
          </GuideSection>

          <GuideSection id="connect" title="Connect it yourself">
            <p className="text-pretty text-muted-foreground">
              Every assistant needs the same thing: Orbit&rsquo;s connector address, added as a
              custom connector or remote MCP server.
            </p>
            <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-card sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate font-mono text-[0.9375rem]">{address}</code>
              <CopyButton value={address} label="Copy address" />
            </div>
            <ul className="flex flex-col divide-y rounded-2xl border">
              {ASSISTANT_LINKS.map((link) => (
                <li key={link.key} className="flex flex-col gap-2 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2.5 font-semibold">
                      <AssistantMark name={link.name} className="size-6" />
                      {link.name}
                    </h3>
                    {link.connectorsUrl ? (
                      <a
                        href={link.connectorsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open {link.name} connectors
                        <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ) : null}
                  </div>
                  <p className="text-pretty text-muted-foreground">{link.instruction}</p>
                </li>
              ))}
              <li className="flex flex-col gap-2 p-4 sm:p-5">
                <h3 className="font-semibold">Claude Code and other command-line agents</h3>
                <p className="text-pretty text-muted-foreground">
                  Add Orbit as a remote server over HTTP. In Claude Code:
                </p>
                <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 font-mono text-[0.8125rem] break-all">
                    claude mcp add --transport http orbit {address}
                  </code>
                  <CopyButton
                    value={`claude mcp add --transport http orbit ${address}`}
                    label="Copy command"
                    size="sm"
                  />
                </div>
              </li>
            </ul>
            <p className="text-sm text-pretty text-muted-foreground">
              Assistants that run in the cloud, like ChatGPT, Claude and Grok, reach Orbit from
              their own servers, so Orbit must be at a public HTTPS address. Menus change often; if
              a label differs, look for the closest match.
            </p>
          </GuideSection>

          <GuideSection id="sign-in" title="Sign in and allow">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-pretty marker:text-muted-foreground">
              <li>Your assistant opens an Orbit page. Enter your email address.</li>
              <li>
                Open the link Orbit emails you, or type the code, and press Continue to Orbit.
              </li>
              <li>
                Orbit asks whether the assistant may connect to your spaces. Check the address it
                will send you back to, then press Allow.
              </li>
            </ol>
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-pretty">
              There is no API key or password. Never paste a sign-in link or code into a chat.
            </p>
          </GuideSection>

          <GuideSection id="check" title="Check that it works">
            <p className="text-pretty text-muted-foreground">
              Start a new chat and try one of these. If your assistant asks to confirm an action,
              check it and approve.
            </p>
            <ul className="flex flex-col gap-2">
              {TRY.map((line) => (
                <li
                  key={line}
                  className="w-fit max-w-full rounded-2xl rounded-bl-md bg-primary px-3.5 py-2 text-[0.9375rem] text-primary-foreground"
                >
                  {line}
                </li>
              ))}
            </ul>
            <dl className="flex flex-col divide-y rounded-2xl border">
              <Trouble question="It answers from its own knowledge instead of Orbit.">
                Say &ldquo;use Orbit&rdquo;, or pick Orbit from the assistant&rsquo;s tools or{" "}
                <span className="font-medium">+</span> menu.
              </Trouble>
              <Trouble question="It can read my spaces but will not share.">
                Some plans may only allow read tools in custom connectors. Everything sharing does
                can also be done on the Orbit web page.
              </Trouble>
              <Trouble question="It cannot connect at all.">
                Check the address ends in /mcp and is a public HTTPS address. Remove the connector
                and add it again.
              </Trouble>
              <Trouble question="I want to disconnect an assistant.">
                Sign in, open Assistants and choose Revoke next to it.
              </Trouble>
            </dl>
          </GuideSection>

          <GuideSection id="features" title="What you can do in Orbit">
            <p className="text-pretty text-muted-foreground">
              Your assistant reads and writes your spaces, and the web app is where everyone sees
              them together, including people without an assistant.
            </p>
            <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex flex-col gap-2">
                  <dt className="flex items-center gap-2.5 font-semibold">
                    <Icon aria-hidden="true" className="size-4.5 text-primary" />
                    {title}
                  </dt>
                  <dd className="text-pretty text-muted-foreground">{body}</dd>
                </div>
              ))}
            </dl>
          </GuideSection>

          <div className="flex flex-col items-start gap-4 border-t pt-10">
            <h2 className="heading-section">Ready when you are</h2>
            <p className="text-pretty text-muted-foreground">
              Start a space and invite the people you are planning with. They join from a link,
              whichever assistant they use.
            </p>
            <a href="/auth/sign-in?next=/spaces" className={buttonVariants({ size: "lg" })}>
              Start a space
            </a>
          </div>

          <PolicyLinks className="border-t pt-6" />
        </main>
      </div>
    </>
  );
}

function GuideSection({
  id,
  title,
  children,
}: Readonly<{ id: string; title: string; children: ReactNode }>) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-5">
      <h2
        id={`${id}-title`}
        className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] md:text-[2rem]"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Trouble({ question, children }: Readonly<{ question: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1 p-4 sm:p-5">
      <dt className="font-medium">{question}</dt>
      <dd className="text-pretty text-muted-foreground">{children}</dd>
    </div>
  );
}
