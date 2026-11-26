import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StackMember } from "@/components/common/avatar-stack.types";
import { PersonAvatar } from "@/components/common/person-avatar";
import { PersonPeek } from "@/components/common/person-peek";
import { stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

const BLAKE: StackMember = {
  user_id: "user-blake",
  display_name: "Blake",
  avatar_url: "/api/users/user-blake/avatar?v=3",
  about: "Window seat, always.",
  joined_at: "2026-11-02T09:00:00Z",
  is_you: false,
};

function setup(member: StackMember = BLAKE, isOwner = false) {
  const view = renderPlain(
    <div>
      <label>
        Notes
        <input />
      </label>
      <PersonPeek member={member} isOwner={isOwner}>
        <PersonAvatar name={member.display_name} src={member.avatar_url} size="sm" />
      </PersonPeek>
    </div>,
  );
  return { ...view, trigger: screen.getByRole("button", { name: /profile$/ }) };
}

const card = () => screen.queryByRole("dialog");

describe("PersonPeek", () => {
  beforeEach(() => {
    stubImage({ width: 256, height: 256 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("the button", () => {
    it("is named for the person, so it makes sense without seeing the picture", () => {
      const { trigger } = setup();

      expect(trigger).toHaveAccessibleName("Blake's profile");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("takes its name from hidden text, so the initials it shows can never clash with a label", () => {
      const { trigger } = setup();

      expect(trigger).not.toHaveAttribute("aria-label");
      expect(trigger.querySelector(".sr-only")).toHaveTextContent("Blake's profile");
    });

    it("says Your profile for the person themselves", () => {
      setup({ ...BLAKE, is_you: true });

      expect(screen.getByRole("button", { name: "Your profile" })).toBeInTheDocument();
    });

    it("can be reached with Tab", async () => {
      const { user, trigger } = setup();

      await user.tab();
      await user.tab();

      expect(trigger).toHaveFocus();
    });
  });

  describe("with a click, a tap or the keyboard", () => {
    it("opens the card on click with the name, the about line and when they joined", async () => {
      const { user, trigger } = setup();

      await user.click(trigger);

      const open = await screen.findByRole("dialog", { name: "Blake's profile" });
      expect(open).toHaveTextContent("Blake");
      expect(open).toHaveTextContent("Window seat, always.");
      expect(open).toHaveTextContent("Joined");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("shows the photo in the card", async () => {
      const { user, trigger } = setup();

      await user.click(trigger);

      const open = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(open.querySelector("img")).toHaveAttribute("src", BLAKE.avatar_url),
      );
    });

    it("moves focus into the card so a screen reader reads it", async () => {
      const { user, trigger } = setup();

      await user.click(trigger);

      expect(await screen.findByRole("dialog")).toHaveFocus();
    });

    it("opens with Enter and with Space, and closes with Escape, handing focus back", async () => {
      const { user, trigger } = setup();
      trigger.focus();

      await user.keyboard("{Enter}");
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(card()).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();

      await user.keyboard(" ");
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("closes when clicking the button again", async () => {
      const { user, trigger } = setup();
      await user.click(trigger);
      await screen.findByRole("dialog");

      await user.click(trigger);

      await waitFor(() => expect(card()).not.toBeInTheDocument());
    });

    it("closes when clicking anywhere else", async () => {
      const { user, trigger } = setup();
      await user.click(trigger);
      await screen.findByRole("dialog");

      await user.click(screen.getByRole("textbox", { name: "Notes" }));

      await waitFor(() => expect(card()).not.toBeInTheDocument());
    });

    it("opens on a tap, which has no hover", async () => {
      const { trigger } = setup();

      fireEvent.pointerEnter(trigger, { pointerType: "touch" });
      fireEvent.click(trigger);

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("does not open by itself when a finger merely touches down", async () => {
      const { trigger } = setup();

      fireEvent.pointerEnter(trigger, { pointerType: "touch" });
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(card()).not.toBeInTheDocument();
    });
  });

  describe("with a mouse resting on the picture", () => {
    it("opens after a short pause without taking focus from what the person is typing in", async () => {
      const { user, trigger } = setup();
      const notes = screen.getByRole("textbox", { name: "Notes" });
      await user.click(notes);

      await user.hover(trigger);

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(notes).toHaveFocus();
    });

    it("closes shortly after the mouse leaves", async () => {
      const { user, trigger } = setup();
      await user.hover(trigger);
      await screen.findByRole("dialog");

      await user.unhover(trigger);

      await waitFor(() => expect(card()).not.toBeInTheDocument());
    });

    it("stays open while the mouse moves from the picture onto the card", async () => {
      const { user, trigger } = setup();
      await user.hover(trigger);
      const open = await screen.findByRole("dialog");

      fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
      fireEvent.pointerEnter(open, { pointerType: "mouse" });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(card()).toBeInTheDocument();
    });

    it("does not flash open when the mouse only passes over", async () => {
      const { user, trigger } = setup();

      await user.hover(trigger);
      await user.unhover(trigger);
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(card()).not.toBeInTheDocument();
    });

    it("keeps the card open when the person clicks while it is showing, and closes it with Escape", async () => {
      const { user, trigger } = setup();
      await user.hover(trigger);
      await screen.findByRole("dialog");

      await user.click(trigger);
      await user.unhover(trigger);
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(card()).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(card()).not.toBeInTheDocument());
    });
  });

  describe("the card", () => {
    it("says You for the person themselves and Owner for the owner", async () => {
      const { user, trigger } = setup({ ...BLAKE, is_you: true }, true);

      await user.click(trigger);

      const open = await screen.findByRole("dialog", { name: "Your profile" });
      expect(open).toHaveTextContent("You");
      expect(open).toHaveTextContent("Owner");
    });

    it("leaves out the about line when there is none", async () => {
      const { user, trigger } = setup({ ...BLAKE, about: "" });

      await user.click(trigger);

      const open = await screen.findByRole("dialog");
      expect(open).toHaveTextContent("Blake");
      expect(open).not.toHaveTextContent("Window seat");
    });

    it("shows an about line as plain text, never as markup", async () => {
      const { user, trigger } = setup({
        ...BLAKE,
        about: "<b>bold</b> and <a href='https://evil.example'>a link</a>",
      });

      await user.click(trigger);

      const open = await screen.findByRole("dialog");
      expect(open).toHaveTextContent("<b>bold</b> and <a href='https://evil.example'>a link</a>");
      expect(open.querySelector("b")).toBeNull();
      expect(open.querySelector("a")).toBeNull();
    });

    it("works for someone with no photo, showing their initial", async () => {
      const { user, trigger } = setup({ ...BLAKE, avatar_url: null });

      await user.click(trigger);

      const open = await screen.findByRole("dialog");
      expect(open.querySelector("img")).toBeNull();
      expect(open).toHaveTextContent("B");
    });
  });
});
