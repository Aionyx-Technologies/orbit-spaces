import { screen, within } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { ExpandableText } from "@/components/space/expandable-text";
import { PlanText } from "@/components/space/plan-text";
import { ProvenanceLine } from "@/components/space/provenance-line";
import { itemSource } from "@/lib/provenance";
import { ALEX_ID, makeItem, makePlan } from "@/tests/unit/helpers/fixtures";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("ProvenanceLine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads like a sentence: who, via what, when", () => {
    renderPlain(
      <ProvenanceLine
        source={itemSource(makeItem())}
        createdAt="2026-11-19T10:00:00Z"
        meId={ALEX_ID}
      />,
    );

    expect(screen.getByText("Blake")).toBeInTheDocument();
    expect(screen.getByText(/via Grok/)).toBeInTheDocument();
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
  });

  it("shows the logo of the assistant that was used, and a dot when it has none", () => {
    const logo = renderPlain(
      <ProvenanceLine
        source={itemSource(makeItem({ via: "Claude" }))}
        createdAt="2026-11-19T10:00:00Z"
        meId={ALEX_ID}
      />,
    );
    expect(logo.container.querySelector("svg")).toHaveAttribute("data-assistant", "claude");
    logo.unmount();

    const dot = renderPlain(
      <ProvenanceLine
        source={itemSource(makeItem({ via: "Gemini" }))}
        createdAt="2026-11-19T10:00:00Z"
        meId={ALEX_ID}
      />,
    );
    expect(dot.container.querySelector('[data-slot="assistant-mark"]')).toHaveAttribute(
      "data-assistant",
      "other",
    );
    expect(dot.container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("says You for your own contributions", () => {
    renderPlain(
      <ProvenanceLine
        source={{
          person: { user_id: ALEX_ID, display_name: "Alex", avatar_url: null },
          via: "ChatGPT",
        }}
        createdAt="2026-11-18T12:00:00Z"
        meId={ALEX_ID}
      />,
    );

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText(/via ChatGPT/)).toBeInTheDocument();
    expect(screen.getByText("yesterday")).toBeInTheDocument();
  });

  it("mentions the web for items shared from the page", () => {
    renderPlain(
      <ProvenanceLine
        source={{
          person: { user_id: ALEX_ID, display_name: "Alex", avatar_url: null },
          via: "web",
        }}
        createdAt="2026-11-19T11:00:00Z"
        meId="someone-else"
      />,
    );

    expect(screen.getByText(/on the web/)).toBeInTheDocument();
  });

  it("labels Orbit with a distinct separator and the requesting assistant", () => {
    renderPlain(
      <ProvenanceLine
        source={itemSource(makePlan())}
        createdAt="2026-11-19T11:00:00Z"
        meId={ALEX_ID}
      />,
    );

    expect(screen.getByText("Orbit")).toBeInTheDocument();
    expect(screen.getByText(/requested via ChatGPT/)).toBeInTheDocument();
  });

  it("hides decorative separators from assistive technology", () => {
    const { container } = renderPlain(
      <ProvenanceLine
        source={itemSource(makePlan())}
        createdAt="2026-11-19T11:00:00Z"
        meId={ALEX_ID}
      />,
    );

    for (const separator of container.querySelectorAll('[aria-hidden="true"]')) {
      expect(separator).toBeInTheDocument();
    }
    expect(container.textContent).toContain("·");
  });
});

describe("ExpandableText", () => {
  it("shows short text in full without a toggle", () => {
    renderPlain(<ExpandableText text="Leaves Dec 20 at 7:10" />);

    expect(screen.getByText("Leaves Dec 20 at 7:10")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps line breaks and never renders markup", () => {
    const { container } = renderPlain(<ExpandableText text={"line one\n<b>bold</b>"} />);

    const paragraph = container.querySelector("p");
    expect(paragraph).toHaveClass("whitespace-pre-wrap");
    expect(paragraph?.textContent).toBe("line one\n<b>bold</b>");
    expect(container.querySelector("b")).toBeNull();
  });

  it("collapses long text and expands it on request", async () => {
    const { user } = renderPlain(<ExpandableText text={"word ".repeat(200)} />);
    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
    const text = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(text).toHaveClass("line-clamp-6");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(text).not.toHaveClass("line-clamp-6");
  });

  it("collapses text with many short lines", () => {
    renderPlain(<ExpandableText text={"a\n".repeat(12)} />);
    expect(screen.getByRole("button", { name: "Show more" })).toBeInTheDocument();
  });

  it("toggles with the keyboard", async () => {
    const { user } = renderPlain(<ExpandableText text={"word ".repeat(200)} />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });
});

describe("PlanText", () => {
  it("renders paragraphs, bullet lists and the To settle heading", () => {
    renderPlain(
      <PlanText
        text={"Stay at Hotel 2.\n\n- Flights on Dec 20\n- Taxi\n\nTo settle\n- Check-in time"}
      />,
    );

    expect(screen.getByText("Stay at Hotel 2.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "To settle" })).toBeInTheDocument();
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(within(lists[0] as HTMLElement).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lists[1] as HTMLElement).getByText("Check-in time")).toBeInTheDocument();
  });

  it("renders bold text as strong elements", () => {
    renderPlain(<PlanText text="Stay at **Hotel 2** near the beach" />);
    expect(screen.getByText("Hotel 2").tagName).toBe("STRONG");
  });

  it("never turns text into HTML", () => {
    const { container } = renderPlain(
      <PlanText text={'<img src=x onerror="alert(1)">\n\n- <script>alert(2)</script>'} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.textContent).toContain("<script>alert(2)</script>");
  });

  it("renders nothing for empty text", () => {
    const { container } = renderPlain(<PlanText text="" />);
    expect(container.firstElementChild?.children).toHaveLength(0);
  });

  it("keeps line breaks inside paragraphs", () => {
    renderPlain(<PlanText text={"one\ntwo"} />);
    expect(screen.getByText(/one/)).toHaveClass("whitespace-pre-line");
  });
});
