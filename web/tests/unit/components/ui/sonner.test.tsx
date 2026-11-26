import { act, screen } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it } from "vitest";

import { Toaster } from "@/components/ui/sonner";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("Toaster", () => {
  it("shows toasts in a notifications region", async () => {
    renderPlain(<Toaster />);

    act(() => {
      toast.success("Space created");
    });

    expect(await screen.findByText("Space created")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /notifications/i })).toBeInTheDocument();
  });
});
