import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProvenanceLine } from "@/components/space/provenance-line";
import { SpaceMembersProvider } from "@/components/space/space-members";
import { itemSource } from "@/lib/provenance";
import {
  ALEX,
  ALEX_ID,
  BLAKE,
  BLAKE_ID,
  makeFact,
  makeItem,
  makePlan,
} from "@/tests/unit/helpers/fixtures";
import { stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

const OLD_PHOTO = "/api/users/user-blake/avatar?v=1";
const NEW_PHOTO = "/api/users/user-blake/avatar?v=2";

function line(
  item = makeItem({
    shared_by: { user_id: BLAKE_ID, display_name: "Blake", avatar_url: OLD_PHOTO },
  }),
) {
  return (
    <ProvenanceLine source={itemSource(item)} createdAt="2026-11-19T10:00:00Z" meId={ALEX_ID} />
  );
}

describe("ProvenanceLine avatars", () => {
  beforeEach(() => {
    stubImage({ width: 256, height: 256 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the photo of whoever shared it", async () => {
    const { container } = renderPlain(line());

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", OLD_PHOTO));
  });

  it("shows the initial when they have no photo", () => {
    renderPlain(
      line(makeItem({ shared_by: { user_id: BLAKE_ID, display_name: "Blake", avatar_url: null } })),
    );

    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("prefers the current photo from the members list over the one the item carried", async () => {
    const { container } = renderPlain(
      <SpaceMembersProvider members={[ALEX, { ...BLAKE, avatar_url: NEW_PHOTO }]}>
        {line()}
      </SpaceMembersProvider>,
    );

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", NEW_PHOTO));
  });

  it("opens a card with the name and about line of that member", async () => {
    const { user } = renderPlain(
      <SpaceMembersProvider members={[ALEX, { ...BLAKE, about: "Window seat, always." }]}>
        {line()}
      </SpaceMembersProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Blake's profile" }));

    const card = await screen.findByRole("dialog", { name: "Blake's profile" });
    expect(card).toHaveTextContent("Blake");
    expect(card).toHaveTextContent("Window seat, always.");
  });

  it("still opens a card, without an about line, outside a space that knows its members", async () => {
    const { user } = renderPlain(line());

    await user.click(screen.getByRole("button", { name: "Blake's profile" }));

    const card = await screen.findByRole("dialog");
    expect(card).toHaveTextContent("Blake");
    expect(card).not.toHaveTextContent("Joined");
  });

  it("calls your own contributions Your profile", () => {
    renderPlain(
      line(makeItem({ shared_by: { user_id: ALEX_ID, display_name: "Alex", avatar_url: null } })),
    );

    expect(screen.getByRole("button", { name: "Your profile" })).toBeInTheDocument();
  });

  it("works for facts too", async () => {
    const fact = makeFact({
      set_by: { user_id: BLAKE_ID, display_name: "Blake", avatar_url: OLD_PHOTO },
    });
    const { container } = renderPlain(
      <ProvenanceLine
        source={{ person: fact.set_by, via: fact.via }}
        createdAt={fact.created_at}
        meId={ALEX_ID}
      />,
    );

    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", OLD_PHOTO));
    expect(screen.getByRole("button", { name: "Blake's profile" })).toBeInTheDocument();
  });

  it("gives Orbit its mark and no profile card", () => {
    const { container } = renderPlain(line(makePlan()));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("shows a question mark and no profile card for someone who has left", () => {
    renderPlain(
      line(makeItem({ shared_by: { user_id: null, display_name: null, avatar_url: null } })),
    );

    expect(screen.queryByRole("button", { name: /profile/ })).not.toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByText("Former member")).toBeInTheDocument();
  });
});
