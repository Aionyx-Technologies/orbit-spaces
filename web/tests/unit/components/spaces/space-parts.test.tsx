import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BackLink } from "@/components/common/back-link";
import { ConnectBanner } from "@/components/spaces/connect-banner";
import { HighlightChips } from "@/components/spaces/highlight-chips";
import { InviteCover } from "@/components/spaces/invite-cover";
import { SourceBadges } from "@/components/spaces/source-badges";
import { SpaceCover } from "@/components/spaces/space-cover";
import { SpaceRow } from "@/components/spaces/space-row";
import { SpacesEmpty } from "@/components/spaces/spaces-empty";
import { buildCoverArt } from "@/lib/cover-art";
import { makeQuietSpace, makeSpaceSummary } from "@/tests/unit/helpers/fixtures";
import { renderPlain } from "@/tests/unit/helpers/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("SpaceRow", () => {
  it("is one article named after the space, with a single link into it", () => {
    renderPlain(<SpaceRow space={makeSpaceSummary()} />);

    const row = screen.getByRole("article", { name: "Goa trip" });
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/spaces/space-1");
  });

  it("summarises the facts on one line and credits the last change", () => {
    renderPlain(<SpaceRow space={makeSpaceSummary()} />);

    const row = screen.getByRole("article");
    expect(row).toHaveTextContent("Dates Dec 20 to 23 · Budget $3,000");
    expect(row).toHaveTextContent("Grok added “Hotel shortlist”");
    expect(row).toHaveTextContent("Yours");
  });

  it("shows the plan marker only when there is a plan", () => {
    const { unmount } = renderPlain(<SpaceRow space={makeSpaceSummary({ has_plan: true })} />);
    expect(screen.getByRole("img", { name: "Has a plan" })).toBeInTheDocument();
    unmount();

    renderPlain(<SpaceRow space={makeSpaceSummary({ has_plan: false })} />);
    expect(screen.queryByRole("img", { name: "Has a plan" })).not.toBeInTheDocument();
  });

  it("leaves out the facts line for a space with none", () => {
    const { unmount } = renderPlain(<SpaceRow space={makeSpaceSummary()} />);
    expect(screen.getByRole("article").querySelectorAll("p")).toHaveLength(2);
    unmount();

    renderPlain(<SpaceRow space={makeQuietSpace()} />);
    expect(screen.getByRole("article").querySelectorAll("p")).toHaveLength(1);
    expect(screen.getByRole("article")).toHaveTextContent("Nothing shared yet");
  });
});

describe("HighlightChips", () => {
  const space = makeSpaceSummary({
    highlights: [
      { key: "A", value: "1" },
      { key: "B", value: "2" },
      { key: "C", value: "3" },
    ],
  });

  it("shows two highlights unless asked for more", () => {
    renderPlain(<HighlightChips space={space} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("can show more when there is room", () => {
    renderPlain(<HighlightChips space={space} limit={3} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("SpaceCover", () => {
  it("draws the orbits, every person and assistant, and a glowing core", () => {
    const space = makeSpaceSummary();
    const art = buildCoverArt(space);
    const { container } = renderPlain(<SpaceCover art={art} />);

    expect(container.querySelector('[data-slot="space-cover"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelectorAll("ellipse")).toHaveLength(3);
    expect(container.querySelectorAll(".satellite")).toHaveLength(art.satellites.length);
    expect(container.querySelectorAll('.satellite[data-kind="person"]')).toHaveLength(2);
    expect(container.querySelectorAll('.satellite[data-kind="assistant"]')).toHaveLength(2);
    expect(container.querySelector(".cover-core")).toBeInTheDocument();
  });

  it("shows an empty space as a hollow, dashed core", () => {
    const art = buildCoverArt(makeQuietSpace({ members: [], sources: [] }));
    const { container } = renderPlain(<SpaceCover art={art} />);

    expect(container.querySelector(".cover-core")).not.toBeInTheDocument();
    expect(container.querySelector("circle[stroke-dasharray]")).toBeInTheDocument();
  });

  it("passes each satellite its own orbit through CSS variables", () => {
    const art = buildCoverArt(makeSpaceSummary());
    const { container } = renderPlain(<SpaceCover art={art} />);
    const first = container.querySelector<SVGCircleElement>(".satellite");

    expect(first?.style.getPropertyValue("--rx")).toBe(String(art.satellites[0]?.rx));
    expect(first?.style.getPropertyValue("--a0")).toBe(`${art.satellites[0]?.angle}deg`);
  });
});

describe("InviteCover", () => {
  it("is decorative and draws dashed orbits around a beacon", () => {
    const { container } = renderPlain(<InviteCover />);

    expect(container.querySelector('[data-slot="invite-cover"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelectorAll("ellipse")).toHaveLength(3);
  });
});

describe("SourceBadges", () => {
  it("renders nothing for a space no assistant has touched", () => {
    const { container } = renderPlain(<SourceBadges sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the assistants for assistive technology and shows one mark each", () => {
    const { container } = renderPlain(<SourceBadges sources={["ChatGPT", "web"]} />);

    expect(screen.getByText("Used with ChatGPT, Web")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="assistant-mark"]')).toHaveLength(2);
  });

  it("shows the real logo for assistants that have one and a dot for the rest", () => {
    const { container } = renderPlain(
      <SourceBadges sources={["ChatGPT", "Claude", "Grok", "Gemini"]} max={4} />,
    );

    const marks = Array.from(container.querySelectorAll('[data-slot="assistant-mark"]'));
    expect(marks.map((mark) => mark.getAttribute("data-assistant"))).toEqual([
      "chatgpt",
      "claude",
      "grok",
      "other",
    ]);
    expect(container.querySelectorAll("svg")).toHaveLength(3);
  });

  it("gives each mark a tooltip with the assistant's name", () => {
    const { container } = renderPlain(<SourceBadges sources={["Claude", "Gemini"]} />);

    expect(container.querySelector("svg title")).toHaveTextContent("Claude");
    expect(container.querySelector('span[data-assistant="other"]')).toHaveAttribute(
      "title",
      "Gemini",
    );
  });

  it("counts the ones it has no room to draw", () => {
    const { container } = renderPlain(<SourceBadges sources={["a", "b", "c", "d", "e"]} max={3} />);

    expect(container.querySelectorAll('[data-slot="assistant-mark"]')).toHaveLength(3);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});

describe("SpacesEmpty", () => {
  it("invites someone to start their first space", () => {
    renderPlain(<SpacesEmpty kind="none" />);

    expect(screen.getByRole("heading", { name: "Start your first space" })).toBeInTheDocument();
    expect(screen.getByText(/share this to Orbit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New space" })).toBeInTheDocument();
  });

  it.each([
    ["yours", "No spaces of your own yet", true],
    ["shared", "Nothing shared with you yet", false],
    ["pending", "No pending invitations", false],
  ] as const)("explains an empty %s tab", (kind, title, hasAction) => {
    renderPlain(<SpacesEmpty kind={kind} />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New space" }) !== null).toBe(hasAction);
  });

  it("points people who are waiting on an invitation to the Pending tab", () => {
    renderPlain(<SpacesEmpty kind="shared" />);
    expect(screen.getByText(/live under Pending/)).toBeInTheDocument();
  });

  it("says what the search was for and lets people clear it", async () => {
    const clear = vi.fn();
    const { user } = renderPlain(<SpacesEmpty kind="search" query="zzz" onClearSearch={clear} />);

    expect(screen.getByRole("heading", { name: "No spaces match “zzz”" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all spaces" }));

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("does not offer to clear a search it cannot clear", () => {
    renderPlain(<SpacesEmpty kind="search" query="zzz" />);
    expect(screen.queryByRole("button", { name: "Show all spaces" })).not.toBeInTheDocument();
  });
});

describe("ConnectBanner", () => {
  it("shows the logos of the assistants it is talking about", () => {
    const { container } = renderPlain(<ConnectBanner />);

    expect(
      Array.from(container.querySelectorAll("svg")).map((logo) =>
        logo.getAttribute("data-assistant"),
      ),
    ).toEqual(["chatgpt", "claude", "grok", "muse", "openclaw", "hermes", "wabi"]);
  });

  it("points people who use an assistant to the Assistants tab", () => {
    renderPlain(<ConnectBanner />);

    expect(screen.getByRole("complementary", { name: "Connect an assistant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect it on the Assistants tab" })).toHaveAttribute(
      "href",
      "/assistants",
    );
  });
});

describe("BackLink", () => {
  it("is a link with a visible label and a decorative arrow", () => {
    renderPlain(<BackLink href="/spaces">Spaces</BackLink>);

    const link = screen.getByRole("link", { name: "Spaces" });
    expect(link).toHaveAttribute("href", "/spaces");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
