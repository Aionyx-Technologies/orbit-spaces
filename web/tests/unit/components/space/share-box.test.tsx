import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShareBox } from "@/components/space/share-box";
import { NETWORK_MESSAGE } from "@/lib/api";
import { CONTENT_MAX, CONTENT_WARN_AT, TITLE_MAX } from "@/lib/constants";
import { makeItem } from "@/tests/unit/helpers/fixtures";
import { errorResponse, failFetch, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const ITEMS_URL = "/api/spaces/space-1/items";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/space-1"),
}));

vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

function setup() {
  const onShared = vi.fn();
  const view = renderWithProviders(<ShareBox spaceId="space-1" onShared={onShared} />);
  return {
    onShared,
    textarea: screen.getByRole("textbox", { name: "Share something" }),
    shareButton: () => screen.getByRole("button", { name: /^Share/ }),
    ...view,
  };
}

describe("ShareBox", () => {
  it("offers one labelled field and a Share button that waits for words", async () => {
    const { textarea, shareButton, user } = setup();

    expect(textarea).toBeInTheDocument();
    expect(shareButton()).toBeDisabled();

    await user.type(textarea, "   ");
    expect(shareButton()).toBeDisabled();

    await user.type(textarea, "Hello");
    expect(shareButton()).toBeEnabled();
  });

  it("reassures people about who can see what they share", () => {
    const { textarea } = setup();

    expect(textarea).toHaveAccessibleDescription(
      "Only what you share here is visible to the others.",
    );
  });

  it("shares with a title taken from the first line, then clears and refocuses", async () => {
    const created = makeItem({ id: "new-item", title: "Morning flight" });
    const mock = mockFetch({ [`POST ${ITEMS_URL}`]: jsonResponse(created, 201) });
    const { onShared, textarea, shareButton, user } = setup();

    await user.type(textarea, "Morning flight{Enter}Leaves at 7");
    await user.click(shareButton());

    await waitFor(() => expect(onShared).toHaveBeenCalledWith(created));
    expect(mock.callsTo("POST", ITEMS_URL)[0]?.json).toEqual({
      title: "Morning flight",
      content: "Morning flight\nLeaves at 7",
    });
    expect(toasts.success).toHaveBeenCalledWith("Shared with this space");
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(textarea).toHaveFocus();
  });

  it("lets you write your own title", async () => {
    const mock = mockFetch({ [`POST ${ITEMS_URL}`]: jsonResponse(makeItem(), 201) });
    const { textarea, shareButton, user } = setup();
    await user.type(textarea, "Details about the flight");

    await user.click(screen.getByRole("button", { name: "Add a title" }));

    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveAttribute("placeholder", "Details about the flight");
    expect(title).toHaveAttribute("maxlength", String(TITLE_MAX));
    expect(screen.queryByRole("button", { name: "Add a title" })).not.toBeInTheDocument();

    await user.type(title, "  Flight  ");
    await user.click(shareButton());

    await waitFor(() => expect(mock.callsTo("POST", ITEMS_URL)).toHaveLength(1));
    expect(mock.callsTo("POST", ITEMS_URL)[0]?.json).toEqual({
      title: "Flight",
      content: "Details about the flight",
    });
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Add a title" })).toBeInTheDocument();
  });

  it("shares with Ctrl+Enter and Cmd+Enter but not with plain Enter", async () => {
    mockFetch({ [`POST ${ITEMS_URL}`]: jsonResponse(makeItem(), 201) });
    const { onShared, textarea, user } = setup();

    await user.type(textarea, "Plain enter{Enter}");
    expect(onShared).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Plain enter\n");

    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(onShared).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(textarea).toHaveValue(""));

    await user.type(textarea, "From a Mac");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(onShared).toHaveBeenCalledTimes(2));
  });

  it("ignores the keyboard shortcut when there is nothing to share", async () => {
    const mock = mockFetch({});
    const { textarea, user } = setup();

    await user.click(textarea);
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(mock.calls).toHaveLength(0);
  });

  it("shows a counter only when close to the limit", () => {
    const { textarea } = setup();

    fireEvent.change(textarea, { target: { value: "a".repeat(CONTENT_WARN_AT - 1) } });
    expect(textarea).toHaveAccessibleDescription(
      "Only what you share here is visible to the others.",
    );

    fireEvent.change(textarea, { target: { value: "a".repeat(CONTENT_WARN_AT) } });
    expect(textarea).toHaveAccessibleDescription("18,000 of 20,000");
  });

  it("blocks sharing over the limit and says by how much", () => {
    const { textarea, shareButton } = setup();

    fireEvent.change(textarea, { target: { value: "a".repeat(CONTENT_MAX) } });
    expect(shareButton()).toBeEnabled();
    expect(textarea).toHaveAttribute("aria-invalid", "false");

    fireEvent.change(textarea, { target: { value: "a".repeat(CONTENT_MAX + 1) } });
    expect(textarea).toHaveAccessibleDescription("Too long by 1 character");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(shareButton()).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "a".repeat(CONTENT_MAX + 1_000) } });
    expect(textarea).toHaveAccessibleDescription("Too long by 1,000 characters");
  });

  it("shows the server's message and keeps what was typed", async () => {
    mockFetch({
      [`POST ${ITEMS_URL}`]: errorResponse(
        429,
        "rate_limited",
        "You're sharing quickly. Try again in a minute.",
      ),
    });
    const { onShared, textarea, shareButton, user } = setup();
    await user.type(textarea, "Hello");

    await user.click(shareButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You're sharing quickly. Try again in a minute.",
    );
    expect(textarea).toHaveValue("Hello");
    expect(shareButton()).toBeEnabled();
    expect(onShared).not.toHaveBeenCalled();
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("clears the error once a retry works", async () => {
    let attempts = 0;
    mockFetch({
      [`POST ${ITEMS_URL}`]: () =>
        attempts++ === 0
          ? errorResponse(500, "server_error", "Something broke on our side.")
          : jsonResponse(makeItem(), 201),
    });
    const { onShared, textarea, shareButton, user } = setup();
    await user.type(textarea, "Hello");
    await user.click(shareButton());
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(shareButton());

    await waitFor(() => expect(onShared).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a network failure in plain words", async () => {
    failFetch();
    const { textarea, shareButton, user } = setup();
    await user.type(textarea, "Hello");

    await user.click(shareButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK_MESSAGE);
    expect(textarea).toHaveValue("Hello");
  });

  it("sends a signed-out person to sign in without an error message", async () => {
    mockFetch({
      [`POST ${ITEMS_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { textarea, shareButton, user } = setup();
    await user.type(textarea, "Hello");

    await user.click(shareButton());

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces%2Fspace-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(textarea).toHaveValue("Hello");
  });

  it("shows progress and ignores a second attempt while sharing", async () => {
    const gate = Promise.withResolvers<Response>();
    const mock = mockFetch({ [`POST ${ITEMS_URL}`]: () => gate.promise });
    const { onShared, textarea, shareButton, user } = setup();
    await user.type(textarea, "Hello");

    await user.click(shareButton());

    expect(await screen.findByRole("button", { name: "Sharing…" })).toBeDisabled();
    await user.keyboard("{Control>}{Enter}{/Control}");
    gate.resolve(jsonResponse(makeItem(), 201));
    await waitFor(() => expect(onShared).toHaveBeenCalledTimes(1));
    expect(mock.callsTo("POST", ITEMS_URL)).toHaveLength(1);
  });
});
