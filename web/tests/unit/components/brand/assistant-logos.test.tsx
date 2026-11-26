import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { existsSync } from "node:fs";
import { join } from "node:path";

import { AssistantGlyph, RASTER_LOGOS } from "@/components/brand/assistant-glyph";
import { AssistantLogo } from "@/components/brand/assistant-logo";
import { AssistantMark } from "@/components/brand/assistant-mark";
import { CLAUDE_PATH, GROK_PATH, OPENAI_PATH } from "@/lib/assistant-glyphs";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("the logo artwork", () => {
  it.each([
    ["ChatGPT", OPENAI_PATH],
    ["Claude", CLAUDE_PATH],
    ["Grok", GROK_PATH],
  ])("has real path data for %s", (_name, path) => {
    expect(path.startsWith("M")).toBe(true);
    expect(path.length).toBeGreaterThan(500);
    expect(path).not.toMatch(/[^0-9a-zA-Z.\-\s,]/);
  });

  it("keeps the Grok highlights as cut-outs rather than painted shapes", () => {
    expect((GROK_PATH.match(/M/g) ?? []).length).toBe(3);
  });
});

describe("AssistantGlyph", () => {
  it("draws ChatGPT as the knot on a card-coloured disc that follows the text colour", () => {
    const { container } = render(
      <svg>
        <AssistantGlyph assistant="chatgpt" />
      </svg>,
    );

    expect(container.querySelector("circle")).toHaveAttribute("fill", "var(--card)");
    const knot = container.querySelector("path");
    expect(knot).toHaveAttribute("d", OPENAI_PATH);
    expect(knot).toHaveAttribute("fill", "currentColor");
    expect(knot).toHaveAttribute("fill-rule", "evenodd");
  });

  it("draws Claude as the spark on its terracotta tile", () => {
    const { container } = render(
      <svg>
        <AssistantGlyph assistant="claude" />
      </svg>,
    );

    expect(container.querySelector("rect")).toHaveAttribute("fill", "#D97757");
    expect(container.querySelector("path")).toHaveAttribute("d", CLAUDE_PATH);
  });

  it("draws Grok as a ball that follows the text colour, so it stays visible in dark mode", () => {
    const { container } = render(
      <svg>
        <AssistantGlyph assistant="grok" />
      </svg>,
    );

    const ball = container.querySelector("path");
    expect(ball).toHaveAttribute("d", GROK_PATH);
    expect(ball).toHaveAttribute("fill", "currentColor");
    expect(ball).toHaveAttribute("fill-rule", "evenodd");
  });
});

describe("the logos that are pictures", () => {
  it.each([
    ["muse", "/assistants/muse.png"],
    ["openclaw", "/assistants/openclaw.png"],
    ["hermes", "/assistants/hermes.png"],
    ["wabi", "/assistants/wabi.png"],
    ["cursor", "/assistants/cursor.png"],
    ["codex", "/assistants/codex.png"],
  ] as const)("draws %s from its image on a white disc", (assistant, href) => {
    const { container } = render(
      <svg>
        <AssistantGlyph assistant={assistant} />
      </svg>,
    );

    expect(RASTER_LOGOS[assistant]).toBe(href);
    expect(container.querySelector("circle")).toHaveAttribute("fill", "#FFFFFF");
    expect(container.querySelector("image")).toHaveAttribute("href", href);
  });

  it.each(Object.values(RASTER_LOGOS))("ships %s in the public folder", (href) => {
    expect(existsSync(join(process.cwd(), "public", href ?? ""))).toBe(true);
  });
});

describe("AssistantLogo", () => {
  it.each(["chatgpt", "claude", "grok"] as const)(
    "is a decorative square image for %s that assistive technology skips",
    (assistant) => {
      const { container } = renderPlain(<AssistantLogo assistant={assistant} />);

      const logo = container.querySelector("svg");
      expect(logo).toHaveAttribute("aria-hidden", "true");
      expect(logo).toHaveAttribute("viewBox", "0 0 24 24");
      expect(logo).toHaveAttribute("data-assistant", assistant);
      expect(logo).toHaveClass("size-5");
    },
  );

  it("keeps Claude's rounded tile shape and round shapes for the others", () => {
    const { container } = renderPlain(
      <>
        <AssistantLogo assistant="claude" />
        <AssistantLogo assistant="chatgpt" />
        <AssistantLogo assistant="grok" />
      </>,
    );

    const [claude, chatgpt, grok] = Array.from(container.querySelectorAll("svg"));
    expect(claude).toHaveClass("rounded-[22%]");
    expect(chatgpt).toHaveClass("rounded-full");
    expect(grok).toHaveClass("rounded-full");
  });

  it("takes its size from the caller and can carry a tooltip title", () => {
    const { container } = renderPlain(
      <AssistantLogo assistant="grok" className="size-10" title="Grok" />,
    );

    expect(container.querySelector("svg")).toHaveClass("size-10");
    expect(container.querySelector("svg")).not.toHaveClass("size-5");
    expect(container.querySelector("title")).toHaveTextContent("Grok");
  });

  it("has no title element unless it was given one", () => {
    const { container } = renderPlain(<AssistantLogo assistant="grok" />);
    expect(container.querySelector("title")).not.toBeInTheDocument();
  });
});

describe("AssistantMark", () => {
  it.each([
    ["ChatGPT", "chatgpt"],
    ["chatgpt", "chatgpt"],
    ["OpenAI", "chatgpt"],
    ["Claude", "claude"],
    ["Claude Desktop", "claude"],
    ["Anthropic", "claude"],
    ["Grok", "grok"],
    ["  grok  ", "grok"],
    ["Cursor", "cursor"],
    ["Codex", "codex"],
    ["Muse", "muse"],
    ["OpenClaw", "openclaw"],
    ["Open Claw", "openclaw"],
    ["Hermes Agent", "hermes"],
    ["Wabi", "wabi"],
  ])("shows the %s logo", (name, assistant) => {
    const { container } = renderPlain(<AssistantMark name={name} />);

    expect(container.querySelector('[data-slot="assistant-mark"]')).toHaveAttribute(
      "data-assistant",
      assistant,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it.each(["Gemini", "web", "Some New Assistant", ""])(
    "falls back to a coloured dot for %j, which has no logo",
    (name) => {
      const { container } = renderPlain(<AssistantMark name={name} title="Named" />);

      const dot = container.querySelector('[data-slot="assistant-mark"]');
      expect(dot).toHaveAttribute("data-assistant", "other");
      expect(dot?.tagName).toBe("SPAN");
      expect(dot).toHaveAttribute("aria-hidden", "true");
      expect(dot).toHaveAttribute("title", "Named");
      expect((dot as HTMLElement).style.getPropertyValue("--h")).not.toBe("");
      expect(container.querySelector("svg")).not.toBeInTheDocument();
    },
  );

  it("gives the same colour to the same unknown assistant every time", () => {
    const first = renderPlain(<AssistantMark name="Some New Assistant" />);
    const hue = first.container
      .querySelector<HTMLElement>('[data-slot="assistant-mark"]')
      ?.style.getPropertyValue("--h");
    first.unmount();

    const second = renderPlain(<AssistantMark name="Some New Assistant" />);

    expect(
      second.container
        .querySelector<HTMLElement>('[data-slot="assistant-mark"]')
        ?.style.getPropertyValue("--h"),
    ).toBe(hue);
  });

  it("leaves it to the surrounding text to name the assistant", () => {
    renderPlain(<AssistantMark name="Claude" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
