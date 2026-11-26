import { act, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { describe, expect, it } from "vitest";

import { Providers } from "@/components/providers";
import { swrOptions } from "@/lib/swr-options";
import { renderPlain } from "@/tests/unit/helpers/render";

function ConfigProbe() {
  const config = useSWRConfig();
  return <p>{config.onError === swrOptions.onError ? "shared options" : "other options"}</p>;
}

describe("Providers", () => {
  it("renders its children", () => {
    renderPlain(
      <Providers>
        <p>Hello</p>
      </Providers>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("gives the app the shared data-fetching options", () => {
    renderPlain(
      <Providers>
        <ConfigProbe />
      </Providers>,
    );
    expect(screen.getByText("shared options")).toBeInTheDocument();
  });

  it("can show toasts from anywhere", async () => {
    renderPlain(
      <Providers>
        <p>App</p>
      </Providers>,
    );

    act(() => {
      toast.success("Saved");
    });

    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});
