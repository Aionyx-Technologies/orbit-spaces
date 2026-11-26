import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PhotoField } from "@/components/settings/photo-field";
import { TOO_LARGE_MESSAGE, WRONG_TYPE_MESSAGE } from "@/lib/avatar-file";
import { AVATAR_MAX_BYTES } from "@/lib/constants";
import { makeMe } from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { pictureFile, stubCanvas, stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

const PHOTO_URL = "/api/users/user-alex/avatar?v=1";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

function setup(avatarUrl: string | null = null) {
  const onChanged = vi.fn();
  const view = renderPlain(
    <PhotoField name="Alex Smith" avatarUrl={avatarUrl} onChanged={onChanged} />,
  );
  const input = screen.getByLabelText("Choose a photo") as HTMLInputElement;
  return { ...view, input, onChanged };
}

describe("PhotoField", () => {
  beforeEach(() => {
    stubImage({ width: 1200, height: 800 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("without a photo", () => {
    it("shows the initials, says there is no photo and offers an upload", () => {
      setup();

      expect(screen.getByRole("img", { name: "No profile photo yet" })).toHaveTextContent("AS");
      expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
      expect(screen.getByText("JPEG, PNG or WebP, up to 5 MB.")).toBeInTheDocument();
    });

    it("opens the file chooser from the button, for JPEG, PNG and WebP only", async () => {
      const { user, input } = setup();
      const open = vi.spyOn(input, "click");

      await user.click(screen.getByRole("button", { name: "Upload photo" }));

      expect(open).toHaveBeenCalledTimes(1);
      expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
      expect(input).toHaveAttribute("type", "file");
      expect(input).not.toBeVisible();
    });
  });

  describe("with a photo", () => {
    it("offers to change or remove it", () => {
      setup(PHOTO_URL);

      expect(screen.getByRole("img", { name: "Your profile photo" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Upload photo" })).not.toBeInTheDocument();
    });
  });

  describe("choosing a file", () => {
    it.each([
      ["a GIF", pictureFile("loop.gif", "image/gif")],
      ["an SVG", pictureFile("logo.svg", "image/svg+xml")],
      ["a document", pictureFile("cv.pdf", "application/pdf")],
    ])("refuses %s in plain words and does not open the crop step", (_label, file) => {
      const { input } = setup();

      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByRole("alert")).toHaveTextContent(WRONG_TYPE_MESSAGE);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("refuses a file over 5 MB without reading it", () => {
      const { input } = setup();
      const big = pictureFile("big.png", "image/png", AVATAR_MAX_BYTES + 1);

      fireEvent.change(input, { target: { files: [big] } });

      expect(screen.getByRole("alert")).toHaveTextContent(TOO_LARGE_MESSAGE);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("clears an earlier complaint once a good file is chosen", async () => {
      stubCanvas();
      const { input } = setup();
      fireEvent.change(input, { target: { files: [pictureFile("a.gif", "image/gif")] } });
      expect(screen.getByRole("alert")).toBeInTheDocument();

      fireEvent.change(input, { target: { files: [pictureFile()] } });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(await screen.findByRole("dialog", { name: "Crop your photo" })).toBeInTheDocument();
    });

    it("ignores a chooser that was closed without a file", () => {
      const { input } = setup();

      fireEvent.change(input, { target: { files: [] } });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("lets the same file be chosen again after cancelling", async () => {
      stubCanvas();
      const { user, input } = setup();
      const file = pictureFile();
      await user.upload(input, file);
      await user.click(await screen.findByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(input.value).toBe("");

      await user.upload(input, file);

      expect(await screen.findByRole("dialog", { name: "Crop your photo" })).toBeInTheDocument();
    });
  });

  describe("saving a cropped photo", () => {
    it("uploads it, closes the crop step, confirms and reports the updated person", async () => {
      stubCanvas();
      const updated = makeMe({ avatar_url: PHOTO_URL });
      mockFetch({ "POST /api/me/avatar": jsonResponse(updated) });
      const { user, input, onChanged } = setup();
      await user.upload(input, pictureFile());

      const save = await screen.findByRole("button", { name: "Save photo" });
      await waitFor(() => expect(save).toBeEnabled());
      await user.click(save);

      await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
      expect(toasts.success).toHaveBeenCalledWith("Photo saved");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("keeps the crop step open and the person unchanged when the server refuses", async () => {
      stubCanvas();
      mockFetch({
        "POST /api/me/avatar": errorResponse(
          422,
          "invalid",
          "Animated pictures are not supported. Choose a still picture.",
        ),
      });
      const { user, input, onChanged } = setup();
      await user.upload(input, pictureFile());
      const save = await screen.findByRole("button", { name: "Save photo" });
      await waitFor(() => expect(save).toBeEnabled());

      await user.click(save);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Animated pictures are not supported. Choose a still picture.",
      );
      expect(screen.getByRole("dialog", { name: "Crop your photo" })).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
      expect(toasts.success).not.toHaveBeenCalled();
    });
  });

  describe("removing the photo", () => {
    it("removes it at once, confirms and reports the updated person", async () => {
      const updated = makeMe({ avatar_url: null });
      const mock = mockFetch({ "DELETE /api/me/avatar": jsonResponse(updated) });
      const { user, onChanged } = setup(PHOTO_URL);

      await user.click(screen.getByRole("button", { name: "Remove photo" }));

      await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
      expect(mock.callsTo("DELETE", "/api/me/avatar")).toHaveLength(1);
      expect(toasts.success).toHaveBeenCalledWith("Photo removed");
    });

    it("shows progress and removes only once while waiting", async () => {
      const gate = Promise.withResolvers<Response>();
      const mock = mockFetch({ "DELETE /api/me/avatar": () => gate.promise });
      const { user } = setup(PHOTO_URL);

      await user.click(screen.getByRole("button", { name: "Remove photo" }));

      expect(await screen.findByRole("button", { name: "Removing…" })).toBeDisabled();
      gate.resolve(jsonResponse(makeMe()));
      await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(1));
      expect(mock.callsTo("DELETE", "/api/me/avatar")).toHaveLength(1);
    });

    it("shows the server's message and keeps the photo when removing fails", async () => {
      mockFetch({
        "DELETE /api/me/avatar": errorResponse(500, "server_error", "We couldn't remove that."),
      });
      const { user, onChanged } = setup(PHOTO_URL);

      await user.click(screen.getByRole("button", { name: "Remove photo" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't remove that.");
      expect(onChanged).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Remove photo" })).toBeEnabled();
    });

    it("sends a signed-out person to sign in", async () => {
      mockFetch({
        "DELETE /api/me/avatar": errorResponse(401, "unauthenticated", "Sign in to continue."),
      });
      const { user } = setup(PHOTO_URL);

      await user.click(screen.getByRole("button", { name: "Remove photo" }));

      await waitFor(() =>
        expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
