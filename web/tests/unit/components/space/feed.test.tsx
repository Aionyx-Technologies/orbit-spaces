import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Feed } from "@/components/space/feed";
import type { FeedProps } from "@/components/space/feed.types";
import { FeedItem } from "@/components/space/feed-item";
import { ALEX_ID, makeItem, makePlan } from "@/tests/unit/helpers/fixtures";
import { renderPlain } from "@/tests/unit/helpers/render";

const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/download", () => download);

function setupFeed(overrides: Partial<FeedProps> = {}) {
  const props: FeedProps = {
    items: [makeItem()],
    meId: ALEX_ID,
    freshIds: new Set(),
    hasMore: false,
    loadingMore: false,
    error: null,
    onLoadMore: vi.fn(),
    onRetract: vi.fn(),
    ...overrides,
  };
  return { props, ...renderPlain(<Feed {...props} />) };
}

describe("FeedItem", () => {
  it("shows the title, content and provenance as an article", () => {
    renderPlain(<FeedItem item={makeItem()} meId={ALEX_ID} fresh={false} onRetract={vi.fn()} />);

    const article = screen.getByRole("article", { name: "Morning flight" });
    expect(within(article).getByText("Leaves Dec 20 at 7:10")).toBeInTheDocument();
    expect(within(article).getByText("Blake")).toBeInTheDocument();
    expect(within(article).getByText(/via Grok/)).toBeInTheDocument();
  });

  it("offers Retract only on your own notes, named for the item", async () => {
    const onRetract = vi.fn();
    const item = makeItem({ can_retract: true });
    const { user } = renderPlain(
      <FeedItem item={item} meId={ALEX_ID} fresh={false} onRetract={onRetract} />,
    );

    await user.click(screen.getByRole("button", { name: "Retract Morning flight" }));

    expect(onRetract).toHaveBeenCalledWith(item);
  });

  it("offers Share on every note, named for the item, even one that is not yours", async () => {
    download.downloadTextFile.mockReset();
    const { user } = renderPlain(
      <FeedItem
        item={makeItem({ can_retract: false })}
        meId={ALEX_ID}
        fresh={false}
        onRetract={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Share Morning flight" }));
    await user.click(await screen.findByRole("menuitem", { name: "Download as Markdown" }));

    expect(download.downloadTextFile).toHaveBeenCalledWith(
      "morning-flight.md",
      "# Morning flight\n\nLeaves Dec 20 at 7:10\n",
    );
  });

  it("offers Share beside Retract on your own notes", () => {
    renderPlain(
      <FeedItem
        item={makeItem({ can_retract: true })}
        meId={ALEX_ID}
        fresh={false}
        onRetract={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Share Morning flight" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retract Morning flight" })).toBeInTheDocument();
  });

  it("offers Share on an earlier plan, saving the whole plan", async () => {
    download.downloadTextFile.mockReset();
    const { user } = renderPlain(
      <FeedItem item={makePlan()} meId={ALEX_ID} fresh={false} onRetract={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Share Combined plan" }));
    await user.click(await screen.findByRole("menuitem", { name: "Download as Markdown" }));

    expect(download.downloadTextFile).toHaveBeenCalledWith(
      "combined-plan.md",
      "# Combined plan\n\nStay at Hotel 2.\n\nTo settle\n- Check-in time\n",
    );
  });

  it("hides Retract when it is not allowed", () => {
    renderPlain(
      <FeedItem
        item={makeItem({ can_retract: false })}
        meId={ALEX_ID}
        fresh={false}
        onRetract={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Retract/ })).not.toBeInTheDocument();
  });

  it("gives plans a distinct treatment and label", () => {
    renderPlain(<FeedItem item={makePlan()} meId={ALEX_ID} fresh={false} onRetract={vi.fn()} />);

    const article = screen.getByRole("article");
    expect(within(article).getByText("Plan written by Orbit")).toBeInTheDocument();
    expect(article).toHaveClass("ai-frame");
    expect(within(article).getByText("Orbit")).toHaveClass("font-medium");
  });

  it("tucks an earlier plan behind a disclosure", async () => {
    const { user } = renderPlain(
      <FeedItem item={makePlan()} meId={ALEX_ID} fresh={false} onRetract={vi.fn()} />,
    );
    const summary = screen.getByText("Show plan");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");

    await user.click(summary);

    expect(details).toHaveAttribute("open");
    expect(screen.getByRole("heading", { level: 3, name: "To settle" })).toBeVisible();
  });

  it("marks live arrivals so they can animate", () => {
    renderPlain(<FeedItem item={makeItem()} meId={ALEX_ID} fresh onRetract={vi.fn()} />);
    expect(screen.getByRole("article")).toHaveAttribute("data-fresh", "true");
    expect(screen.getByRole("article").className).toContain("motion-safe:animate-in");
  });

  it("does not animate items that were already there", () => {
    renderPlain(<FeedItem item={makeItem()} meId={ALEX_ID} fresh={false} onRetract={vi.fn()} />);
    expect(screen.getByRole("article")).not.toHaveAttribute("data-fresh");
  });

  it("renders shared text as plain text", () => {
    const item = makeItem({ title: "<b>Title</b>", content: "<script>alert(1)</script>" });
    const { container } = renderPlain(
      <FeedItem item={item} meId={ALEX_ID} fresh={false} onRetract={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "<b>Title</b>" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});

describe("Feed", () => {
  it("lists items newest first under a Feed heading", () => {
    setupFeed({
      items: [makeItem({ id: "a", title: "Newest" }), makeItem({ id: "b", title: "Older" })],
    });

    expect(screen.getByRole("heading", { level: 2, name: "Feed" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("Newest")).toBeInTheDocument();
  });

  it("tells people how to share when it is empty", () => {
    setupFeed({ items: [] });

    expect(screen.getByRole("heading", { name: "Nothing shared yet" })).toBeInTheDocument();
    expect(screen.getByText(/share this to Orbit/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("offers Load more only when there is more", async () => {
    const { props, user } = setupFeed({ hasMore: true });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("hides Load more at the end of the feed", () => {
    setupFeed({ hasMore: false });
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("disables Load more while loading", () => {
    setupFeed({ hasMore: true, loadingMore: true });
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });

  it("shows a paging error as an alert", () => {
    setupFeed({ hasMore: true, error: "Could not load more." });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load more.");
  });

  it("passes fresh ids to the right items and retract to the handler", async () => {
    const { props, user } = setupFeed({
      items: [
        makeItem({ id: "a", title: "New one", can_retract: true }),
        makeItem({ id: "b", title: "Old one" }),
      ],
      freshIds: new Set(["a"]),
    });

    const articles = screen.getAllByRole("article");
    expect(articles[0]).toHaveAttribute("data-fresh", "true");
    expect(articles[1]).not.toHaveAttribute("data-fresh");
    await user.click(screen.getByRole("button", { name: "Retract New one" }));
    expect(props.onRetract).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });
});
