import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { ConfirmDialogProps } from "@/components/common/confirm-dialog.types";
import { renderPlain } from "@/tests/unit/helpers/render";

function setup(overrides: Partial<ConfirmDialogProps> = {}) {
  const props: ConfirmDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Delete this space?",
    description: "It can't be undone.",
    confirmLabel: "Delete space",
    onConfirm: vi.fn(),
    ...overrides,
  };
  return { props, ...renderPlain(<ConfirmDialog {...props} />) };
}

describe("ConfirmDialog", () => {
  it("is an alert dialog with a title and description", () => {
    setup();

    const dialog = screen.getByRole("alertdialog", { name: "Delete this space?" });
    expect(dialog).toHaveAccessibleDescription("It can't be undone.");
  });

  it("renders nothing while closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("calls onConfirm and stays open until the caller closes it", async () => {
    const { props, user } = setup();

    await user.click(screen.getByRole("button", { name: "Delete space" }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("asks to close on Cancel and Escape", async () => {
    const { props, user } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onOpenChange).toHaveBeenCalledTimes(2);
  });

  it("looks destructive when asked to", () => {
    setup({ destructive: true });
    expect(screen.getByRole("button", { name: "Delete space" })).toHaveClass("bg-destructive");
  });

  it("looks normal otherwise", () => {
    setup();
    expect(screen.getByRole("button", { name: "Delete space" })).toHaveClass("bg-primary");
  });

  it("shows progress and locks everything while working", async () => {
    const { props, user } = setup({ pending: true, pendingLabel: "Deleting…" });

    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("shows an error as an alert", () => {
    setup({ error: "Only the creator can delete a space." });
    expect(screen.getByRole("alert")).toHaveTextContent("Only the creator can delete a space.");
  });

  it("can hold the confirm button until a condition is met", () => {
    setup({ confirmDisabled: true });
    expect(screen.getByRole("button", { name: "Delete space" })).toBeDisabled();
  });

  it("renders extra content such as a confirmation field", async () => {
    setup({
      children: (
        <label>
          Type delete
          <input />
        </label>
      ),
    });
    await waitFor(() => expect(screen.getByLabelText("Type delete")).toBeInTheDocument());
  });
});
