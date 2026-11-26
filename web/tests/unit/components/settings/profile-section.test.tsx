import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileSection } from "@/components/settings/profile-section";
import { ABOUT_MAX, DISPLAY_NAME_MAX } from "@/lib/constants";
import { makeMe } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { pictureFile, stubCanvas, stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

const ABOUT_PLACEHOLDER = "A line about you, for the people you share spaces with.";

function setup(overrides: Partial<Parameters<typeof ProfileSection>[0]["me"]> = {}) {
  return renderPlain(
    <ProfileSection
      me={{
        display_name: "Alex",
        email: "alex@example.com",
        about: "",
        avatar_url: null,
        ...overrides,
      }}
    />,
  );
}

const nameField = () => screen.getByRole("textbox", { name: "Display name" });
const aboutField = () => screen.getByRole("textbox", { name: "About me" });
const saveButton = () => screen.getByRole("button", { name: "Save profile" });

describe("ProfileSection", () => {
  it("shows the photo, name, about line and sign-in address in one named card", () => {
    setup({ about: "Plans the trips" });

    const region = screen.getByRole("region", { name: "Profile" });
    expect(within(region).getByRole("img", { name: "No profile photo yet" })).toBeInTheDocument();
    expect(nameField()).toHaveValue("Alex");
    expect(nameField()).toHaveAttribute("maxlength", String(DISPLAY_NAME_MAX));
    expect(aboutField()).toHaveValue("Plans the trips");
    expect(aboutField()).toHaveAttribute("maxlength", String(ABOUT_MAX));
    expect(region).toHaveTextContent("Signed in as");
    expect(region).toHaveTextContent("alex@example.com");
  });

  it("gives the sign-in address as plain text, not something to edit", () => {
    setup();

    expect(screen.queryByRole("textbox", { name: /signed in as/i })).not.toBeInTheDocument();
    expect(screen.getByText("alex@example.com")).toBeInTheDocument();
  });

  it("says who can see the profile, under the card", () => {
    setup();

    const note = screen.getByText(
      "Your photo, name and about line are visible only to people in your spaces.",
    );
    const card = screen.getByRole("region", { name: "Profile" });
    expect(card).not.toContainElement(note);
    expect(card.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("invites a line about the person and counts the characters as they type", async () => {
    const { user } = setup();

    expect(aboutField()).toHaveAttribute("placeholder", ABOUT_PLACEHOLDER);
    expect(screen.getByText("0 of 160")).toBeInTheDocument();

    await user.type(aboutField(), "Window seat, please");

    expect(screen.getByText("19 of 160")).toBeInTheDocument();
    expect(aboutField()).toHaveAccessibleDescription("19 of 160");
  });

  it("keeps the about line to one line, because the server does", async () => {
    const { user } = setup();

    await user.type(aboutField(), "First{Enter}Second");

    expect(aboutField()).toHaveValue("First Second");
  });

  it("turns pasted line breaks into spaces", async () => {
    const { user } = setup();
    await user.click(aboutField());

    await user.paste("one\r\n  two\nthree");

    expect(aboutField()).toHaveValue("one two three");
  });

  describe("saving", () => {
    it("offers Save only once the name or the about line has really changed", async () => {
      const { user } = setup({ about: "Plans the trips" });
      expect(saveButton()).toBeDisabled();

      await user.type(nameField(), "   ");
      expect(saveButton()).toBeDisabled();

      await user.clear(nameField());
      expect(saveButton()).toBeDisabled();

      await user.type(nameField(), "Alex  ");
      expect(saveButton()).toBeDisabled();

      await user.type(aboutField(), "!");
      expect(saveButton()).toBeEnabled();

      await user.type(aboutField(), "{Backspace}");
      expect(saveButton()).toBeDisabled();

      await user.type(nameField(), "ander");
      expect(saveButton()).toBeEnabled();
    });

    it("does not offer Save for an emptied name even if the about line changed", async () => {
      const { user } = setup();

      await user.clear(nameField());
      await user.type(aboutField(), "Hello");

      expect(saveButton()).toBeDisabled();
    });

    it("sends only the name when only the name changed", async () => {
      const mock = mockFetch({
        "PATCH /api/me": jsonResponse(makeMe({ display_name: "Alexander" })),
      });
      const { user } = setup({ about: "Plans the trips" });
      await user.clear(nameField());
      await user.type(nameField(), "Alexander");

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Profile saved"));
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ display_name: "Alexander" });
      expect(router.refresh).toHaveBeenCalledTimes(1);
      expect(saveButton()).toBeDisabled();
    });

    it("sends only the about line when only that changed", async () => {
      const mock = mockFetch({
        "PATCH /api/me": jsonResponse(makeMe({ about: "Plans the trips" })),
      });
      const { user } = setup();
      await user.type(aboutField(), "Plans the trips");

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ about: "Plans the trips" });
    });

    it("sends both in one request when both changed, so they save together or not at all", async () => {
      const mock = mockFetch({
        "PATCH /api/me": jsonResponse(makeMe({ display_name: "Lex", about: "Hi" })),
      });
      const { user } = setup();
      await user.clear(nameField());
      await user.type(nameField(), "Lex");
      await user.type(aboutField(), "Hi");

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")).toHaveLength(1);
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({
        display_name: "Lex",
        about: "Hi",
      });
    });

    it("can clear the about line", async () => {
      const mock = mockFetch({ "PATCH /api/me": jsonResponse(makeMe({ about: "" })) });
      const { user } = setup({ about: "Plans the trips" });
      await user.clear(aboutField());

      await user.click(saveButton());

      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")[0]?.json).toEqual({ about: "" });
      expect(aboutField()).toHaveValue("");
    });

    it("shows what the server settled on, which may differ from what was typed", async () => {
      mockFetch({
        "PATCH /api/me": jsonResponse(makeMe({ display_name: "Alexander", about: "Likes trains" })),
      });
      const { user } = setup();
      await user.clear(nameField());
      await user.type(nameField(), "  Alexander  ");
      await user.type(aboutField(), "  Likes   trains ");

      await user.click(saveButton());

      await waitFor(() => expect(nameField()).toHaveValue("Alexander"));
      expect(aboutField()).toHaveValue("Likes trains");
      expect(saveButton()).toBeDisabled();
    });

    it("shows the server's message and keeps what was typed when saving fails", async () => {
      mockFetch({
        "PATCH /api/me": errorResponse(
          422,
          "too_long",
          "About me is too long. The limit is 160 characters.",
        ),
      });
      const { user } = setup();
      await user.type(aboutField(), "A long line");

      await user.click(saveButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "About me is too long. The limit is 160 characters.",
      );
      expect(aboutField()).toHaveValue("A long line");
      expect(saveButton()).toBeEnabled();
      expect(router.refresh).not.toHaveBeenCalled();
      expect(toasts.success).not.toHaveBeenCalled();
    });

    it("sends a signed-out person to sign in", async () => {
      mockFetch({
        "PATCH /api/me": errorResponse(401, "unauthenticated", "Sign in to continue."),
      });
      const { user } = setup();
      await user.type(nameField(), "ander");

      await user.click(saveButton());

      await waitFor(() =>
        expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows progress and saves only once while waiting", async () => {
      const gate = Promise.withResolvers<Response>();
      const mock = mockFetch({ "PATCH /api/me": () => gate.promise });
      const { user } = setup();
      await user.type(nameField(), "ander");

      await user.click(saveButton());

      expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
      await user.keyboard("{Enter}");
      gate.resolve(jsonResponse(makeMe({ display_name: "Alexander" })));
      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("PATCH", "/api/me")).toHaveLength(1);
    });
  });

  describe("the photo", () => {
    beforeEach(() => {
      stubImage({ width: 1200, height: 800 });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("refreshes the page data and shows the new photo once it is saved", async () => {
      stubCanvas();
      mockFetch({
        "POST /api/me/avatar": jsonResponse(
          makeMe({ avatar_url: "/api/users/user-alex/avatar?v=2" }),
        ),
      });
      const { user } = setup();
      await user.upload(screen.getByLabelText("Choose a photo"), pictureFile());
      const save = await screen.findByRole("button", { name: "Save photo" });
      await waitFor(() => expect(save).toBeEnabled());

      await user.click(save);

      expect(await screen.findByRole("button", { name: "Remove photo" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Your profile photo" })).toBeInTheDocument();
      expect(router.refresh).toHaveBeenCalledTimes(1);
      expect(toasts.success).toHaveBeenCalledWith("Photo saved");
    });

    it("goes back to the initials and refreshes once the photo is removed", async () => {
      mockFetch({ "DELETE /api/me/avatar": jsonResponse(makeMe({ avatar_url: null })) });
      const { user } = setup({ avatar_url: "/api/users/user-alex/avatar?v=1" });

      await user.click(screen.getByRole("button", { name: "Remove photo" }));

      expect(await screen.findByRole("button", { name: "Upload photo" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "No profile photo yet" })).toBeInTheDocument();
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("leaves unsaved typing alone when the photo changes", async () => {
      mockFetch({ "DELETE /api/me/avatar": jsonResponse(makeMe({ avatar_url: null })) });
      const { user } = setup({ avatar_url: "/api/users/user-alex/avatar?v=1" });
      await user.type(aboutField(), "Half-written");

      await user.click(screen.getByRole("button", { name: "Remove photo" }));

      await screen.findByRole("button", { name: "Upload photo" });
      expect(aboutField()).toHaveValue("Half-written");
    });
  });
});
