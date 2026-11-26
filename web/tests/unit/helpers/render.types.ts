import type userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

export type RenderedWithUser = {
  user: ReturnType<typeof userEvent.setup>;
};

export type WrapperProps = Readonly<{
  children: ReactNode;
}>;
