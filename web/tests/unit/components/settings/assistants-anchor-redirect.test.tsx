import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantsAnchorRedirect } from "@/components/settings/assistants-anchor-redirect";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  window.location.hash = "";
});

function openWithHash(hash: string) {
  window.location.hash = hash;
  return render(<AssistantsAnchorRedirect />);
}

describe("AssistantsAnchorRedirect", () => {
  it.each(["#connect-title", "#connections-title", "#connector-address"])(
    "sends an old settings link to %s on the Assistants page, keeping the anchor",
    (hash) => {
      openWithHash(hash);

      expect(router.replace).toHaveBeenCalledWith(`/assistants${hash}`);
    },
  );

  it("leaves other anchors and plain settings visits alone", () => {
    const { unmount } = openWithHash("#profile-title");
    unmount();
    window.location.hash = "";
    render(<AssistantsAnchorRedirect />);

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("also acts when the anchor changes while the page is open", () => {
    render(<AssistantsAnchorRedirect />);
    expect(router.replace).not.toHaveBeenCalled();

    act(() => {
      window.location.hash = "#connections-title";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(router.replace).toHaveBeenCalledWith("/assistants#connections-title");
  });

  it("stops listening when it goes away", () => {
    const { unmount } = render(<AssistantsAnchorRedirect />);
    unmount();

    act(() => {
      window.location.hash = "#connect-title";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { container } = render(<AssistantsAnchorRedirect />);

    expect(container).toBeEmptyDOMElement();
  });
});
