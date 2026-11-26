import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PhotoCropDialog } from "@/components/settings/photo-crop-dialog";
import { NETWORK_MESSAGE } from "@/lib/api";
import { PREPARE_MESSAGE, UNREADABLE_MESSAGE } from "@/lib/avatar-file";
import { makeMe } from "@/tests/unit/helpers/fixtures";
import { errorResponse, failFetch, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { pictureFile, stubCanvas, stubImage } from "@/tests/unit/helpers/photo-stubs";
import { renderPlain } from "@/tests/unit/helpers/render";

const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/settings"),
}));

vi.mock("@/lib/navigation", () => navigation);

function setup(file = pictureFile()) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const view = renderPlain(<PhotoCropDialog file={file} onClose={onClose} onSaved={onSaved} />);
  return { ...view, onClose, onSaved };
}

async function loaded() {
  const save = await screen.findByRole("button", { name: "Save photo" });
  await waitFor(() => expect(save).toBeEnabled());
  return save;
}

describe("PhotoCropDialog", () => {
  beforeEach(() => {
    stubImage({ width: 1200, height: 800 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains the crop and waits for the picture before it can be saved", async () => {
    stubCanvas();
    setup();

    expect(screen.getByRole("dialog", { name: "Crop your photo" })).toHaveAccessibleDescription(
      /Drag the picture, or use the arrow keys/,
    );
    expect(screen.getByRole("button", { name: "Save photo" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Zoom" })).toBeDisabled();

    await loaded();

    expect(screen.getByRole("slider", { name: "Zoom" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Zoom" })).toHaveValue("1");
  });

  it("uploads the centred square as a file named photo and hands back the updated person", async () => {
    const { drawing } = stubCanvas();
    const updated = makeMe({ avatar_url: "/api/users/user-alex/avatar?v=2" });
    const mock = mockFetch({ "POST /api/me/avatar": jsonResponse(updated) });
    const { user, onSaved } = setup();

    await user.click(await loaded());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(drawing.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      200,
      0,
      800,
      800,
      0,
      0,
      512,
      512,
    );
    const sent = mock.callsTo("POST", "/api/me/avatar")[0]?.formData?.get("file") as File;
    expect(sent.name).toBe("photo.png");
    expect(sent.type).toBe("image/png");
  });

  it("sends a JPEG for a JPEG", async () => {
    stubCanvas();
    const mock = mockFetch({ "POST /api/me/avatar": jsonResponse(makeMe()) });
    const { user } = setup(pictureFile("holiday.jpg", "image/jpeg"));

    await user.click(await loaded());

    await waitFor(() => expect(mock.callsTo("POST", "/api/me/avatar")).toHaveLength(1));
    const sent = mock.callsTo("POST", "/api/me/avatar")[0]?.formData?.get("file") as File;
    expect(sent.name).toBe("photo.jpg");
    expect(sent.type).toBe("image/jpeg");
  });

  it("crops where the person moved the picture with the arrow keys", async () => {
    const { drawing } = stubCanvas();
    mockFetch({ "POST /api/me/avatar": jsonResponse(makeMe()) });
    const { user } = setup();
    const save = await loaded();
    screen.getByRole("group", { name: "Photo crop area" }).focus();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    await user.click(save);

    await waitFor(() => expect(drawing.drawImage).toHaveBeenCalled());
    expect(drawing.drawImage.mock.calls[0]?.slice(1, 5)).toEqual([120, 0, 800, 800]);
  });

  it("crops tighter when the zoom slider is moved", async () => {
    const { drawing } = stubCanvas();
    mockFetch({ "POST /api/me/avatar": jsonResponse(makeMe()) });
    const { user } = setup();
    const save = await loaded();

    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
    await user.click(save);

    await waitFor(() => expect(drawing.drawImage).toHaveBeenCalled());
    expect(drawing.drawImage.mock.calls[0]?.slice(1, 5)).toEqual([400, 200, 400, 400]);
  });

  it("zooms from the keyboard too", async () => {
    stubCanvas();
    const { user } = setup();
    await loaded();
    screen.getByRole("group", { name: "Photo crop area" }).focus();

    await user.keyboard("++");

    expect(screen.getByRole("slider", { name: "Zoom" })).toHaveValue("1.5");
    await user.keyboard("-");
    expect(screen.getByRole("slider", { name: "Zoom" })).toHaveValue("1.25");
  });

  it("shows progress, and cannot be cancelled or dismissed while saving", async () => {
    stubCanvas();
    const gate = Promise.withResolvers<Response>();
    mockFetch({ "POST /api/me/avatar": () => gate.promise });
    const { user, onClose, onSaved } = setup();

    await user.click(await loaded());

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    gate.resolve(jsonResponse(makeMe()));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("closes without uploading when cancelled", async () => {
    stubCanvas();
    const mock = mockFetch({});
    const { user, onClose, onSaved } = setup();
    await loaded();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it("closes from the close button and from Escape", async () => {
    stubCanvas();
    const { user, onClose } = setup();
    await loaded();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the server's own words and keeps the dialog open when the picture is refused", async () => {
    stubCanvas();
    mockFetch({
      "POST /api/me/avatar": errorResponse(
        422,
        "invalid",
        "That picture is more than 6,000 pixels wide or tall. Choose a smaller one.",
      ),
    });
    const { user, onSaved, onClose } = setup();

    await user.click(await loaded());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That picture is more than 6,000 pixels wide or tall. Choose a smaller one.",
    );
    expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the daily limit message as it is", async () => {
    stubCanvas();
    mockFetch({
      "POST /api/me/avatar": errorResponse(
        429,
        "rate_limited",
        "You have changed your photo as often as allowed today. Try again tomorrow.",
      ),
    });
    const { user } = setup();

    await user.click(await loaded());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have changed your photo as often as allowed today. Try again tomorrow.",
    );
  });

  it("explains a refusal that comes back without a message when the upload is far too big", async () => {
    stubCanvas();
    mockFetch({
      "POST /api/me/avatar": () => new Response("too big", { status: 413 }),
    });
    const { user } = setup();

    await user.click(await loaded());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That picture is larger than 5 MB. Choose a smaller one.",
    );
  });

  it("says when Orbit cannot be reached and lets the person try again", async () => {
    stubCanvas();
    failFetch();
    const { user } = setup();

    await user.click(await loaded());

    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK_MESSAGE);
    expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled();
  });

  it("sends a signed-out person to sign in without an error message", async () => {
    stubCanvas();
    mockFetch({
      "POST /api/me/avatar": errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { user } = setup();

    await user.click(await loaded());

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fsettings"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when the browser cannot prepare the picture, without contacting Orbit", async () => {
    stubCanvas({ context: false });
    const mock = mockFetch({});
    const { user } = setup();

    await user.click(await loaded());

    expect(await screen.findByRole("alert")).toHaveTextContent(PREPARE_MESSAGE);
    expect(mock.calls).toHaveLength(0);
  });

  it("says so when the picture cannot be read, and offers no way to save it", async () => {
    stubImage({ width: 1, height: 1, fails: true });
    stubCanvas();
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(UNREADABLE_MESSAGE);
    expect(screen.getByText("No preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save photo" })).toBeDisabled();
  });
});
