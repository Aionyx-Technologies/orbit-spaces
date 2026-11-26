import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { renderPlain } from "@/tests/unit/helpers/render";

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>Anyone with the link can join.</DialogDescription>
        </DialogHeader>
        <input aria-label="Email" />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("opens with its title and description and moves focus inside", async () => {
    const { user } = renderPlain(<Example />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Invite someone" });
    expect(dialog).toHaveAccessibleDescription("Anyone with the link can join.");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const { user } = renderPlain(<Example />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("closes with the Close button", async () => {
    const { user } = renderPlain(<Example />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with a footer button", async () => {
    const { user } = renderPlain(<Example />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps keyboard focus inside while open", async () => {
    const { user } = renderPlain(<Example />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    for (let press = 0; press < 6; press += 1) {
      await user.tab();
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    }
  });
});

describe("AlertDialog", () => {
  function Confirm({ onAction }: { onAction: () => void }) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onAction}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  it("is announced as an alert dialog with a description", async () => {
    const { user } = renderPlain(<Confirm onAction={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete this?" });
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
  });

  it("closes on Cancel without acting", async () => {
    const onAction = vi.fn();
    const { user } = renderPlain(<Confirm onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("acts and closes on the action, which looks destructive", async () => {
    const onAction = vi.fn();
    const { user } = renderPlain(<Confirm onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const action = screen.getAllByRole("button", { name: "Delete" }).at(-1);
    expect(action).toHaveClass("bg-destructive");
    expect(action).not.toHaveClass("hover:bg-primary-hover");
    await user.click(action as HTMLElement);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    const { user } = renderPlain(<Confirm onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
