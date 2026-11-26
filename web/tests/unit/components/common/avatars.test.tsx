import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AvatarStack } from "@/components/common/avatar-stack";
import { PersonAvatar } from "@/components/common/person-avatar";
import { stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("PersonAvatar", () => {
  it("shows initials and hides itself from assistive technology", () => {
    const { container } = renderPlain(<PersonAvatar name="Alex Smith" />);

    expect(screen.getByText("AS")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("shows a question mark for a former member", () => {
    renderPlain(<PersonAvatar name={null} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("shows the Orbit mark instead of initials for Orbit", () => {
    const { container } = renderPlain(<PersonAvatar name="Orbit" orbit />);

    expect(screen.queryByText("O")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it.each([
    ["sm", "size-6"],
    ["md", "size-8"],
    ["lg", "size-9"],
    ["xl", "size-20"],
  ] as const)("supports the %s size", (size, expected) => {
    const { container } = renderPlain(<PersonAvatar name="A" size={size} />);
    expect(container.firstElementChild).toHaveClass(expected);
  });
});

describe("PersonAvatar with a photo", () => {
  const PHOTO = "/api/users/user-blake/avatar?v=3";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the initials until the photo has loaded, then the photo", async () => {
    stubImage({ width: 256, height: 256 });
    const { container } = renderPlain(<PersonAvatar name="Blake Jones" src={PHOTO} />);

    expect(screen.getByText("BJ")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", PHOTO));
    expect(screen.queryByText("BJ")).not.toBeInTheDocument();
  });

  it("keeps the initials when the photo cannot be loaded", async () => {
    stubImage({ width: 256, height: 256, fails: true });
    const { container } = renderPlain(<PersonAvatar name="Blake Jones" src={PHOTO} />);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("BJ")).toBeInTheDocument();
  });

  it("does not try to load anything when there is no photo", () => {
    const { container } = renderPlain(<PersonAvatar name="Blake" src={null} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("is decorative by default, so the name beside it is not read twice", async () => {
    stubImage({ width: 256, height: 256 });
    const { container } = renderPlain(<PersonAvatar name="Blake" src={PHOTO} />);

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("can be given a name when the picture stands on its own", () => {
    renderPlain(<PersonAvatar name="Blake" src={null} label="Your profile photo" />);

    expect(screen.getByRole("img", { name: "Your profile photo" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Your profile photo" })).not.toHaveAttribute(
      "aria-hidden",
    );
  });

  it("never shows a photo for Orbit itself", () => {
    const { container } = renderPlain(<PersonAvatar name="Orbit" orbit src={PHOTO} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("AvatarStack", () => {
  const members = [
    { user_id: "1", display_name: "Alex" },
    { user_id: "2", display_name: "Blake" },
    { user_id: "3", display_name: "Casey" },
  ];

  it("names everyone for assistive technology", () => {
    renderPlain(<AvatarStack members={members} />);
    expect(screen.getByRole("img", { name: "Alex, Blake, Casey" })).toBeInTheDocument();
  });

  it("shows an overflow count beyond the maximum", () => {
    renderPlain(<AvatarStack members={members} max={2} />);

    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("C")).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName("Alex, Blake, Casey");
  });

  it("shows each member's photo when they have one", async () => {
    stubImage({ width: 256, height: 256 });
    const { container } = renderPlain(
      <AvatarStack
        members={[
          { user_id: "1", display_name: "Alex", avatar_url: "/api/users/1/avatar?v=1" },
          { user_id: "2", display_name: "Blake", avatar_url: null },
        ]}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(1));
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/users/1/avatar?v=1");
    expect(screen.getByText("B")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("copes with no members", () => {
    renderPlain(<AvatarStack members={[]} />);
    expect(screen.getByRole("img", { name: "No members" })).toBeInTheDocument();
  });

  it("shows nothing extra when it only knows names", async () => {
    const { user } = renderPlain(<AvatarStack members={members} />);

    await user.hover(screen.getByText("A"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(screen.queryByText(/Joined/)).not.toBeInTheDocument();
  });
});

describe("AvatarStack details on hover", () => {
  const people = [
    { user_id: "1", display_name: "Alex", joined_at: "2026-11-19T09:00:00Z", is_you: true },
    { user_id: "2", display_name: "Blake", joined_at: "2026-11-19T10:00:00Z", is_you: false },
    { user_id: "3", display_name: "Casey", joined_at: "2026-11-19T11:00:00Z", is_you: false },
  ];

  it("shows who someone is and when they joined when the pointer rests on them", async () => {
    const { user } = renderPlain(<AvatarStack members={people} />);

    await user.hover(screen.getByText("B"));

    expect(await screen.findByText("Blake")).toBeInTheDocument();
    expect(screen.getByText(/Joined/)).toBeInTheDocument();
    expect(screen.queryByText("You")).not.toBeInTheDocument();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("says when it is you and when it is the owner", async () => {
    const { user } = renderPlain(<AvatarStack members={people} ownerId="1" />);

    await user.hover(screen.getByText("A"));

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("shows the about line and photo of the person under the pointer", async () => {
    stubImage({ width: 256, height: 256 });
    const { user, container } = renderPlain(
      <AvatarStack
        members={[
          {
            ...people[1],
            about: "Window seat, always.",
            avatar_url: "/api/users/2/avatar?v=1",
          },
        ]}
      />,
    );
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());

    await user.hover(container.querySelector("[data-slot='avatar']") as HTMLElement);

    expect(await screen.findByText("Window seat, always.")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("names everyone who does not fit in the stack", async () => {
    const { user } = renderPlain(<AvatarStack members={people} max={1} />);

    await user.hover(screen.getByText("+2"));

    expect(await screen.findByText("2 more people")).toBeInTheDocument();
    expect(screen.getByText("Blake")).toBeInTheDocument();
    expect(screen.getByText("Casey")).toBeInTheDocument();
  });

  it("stays out of the way of keyboard and screen reader users", () => {
    renderPlain(<AvatarStack members={people} />);

    expect(screen.getByRole("img")).toHaveAccessibleName("Alex, Blake, Casey");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
