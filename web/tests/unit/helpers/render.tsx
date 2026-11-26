import { render, type queries, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { SWRConfig } from "swr";

import type { RenderedWithUser, WrapperProps } from "@/tests/unit/helpers/render.types";

function Wrapper({ children }: WrapperProps) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0 }}>
      {children}
    </SWRConfig>
  );
}

export function renderWithProviders(ui: ReactElement): RenderResult & RenderedWithUser {
  const user = userEvent.setup();
  return { user, ...render<typeof queries>(ui, { wrapper: Wrapper }) };
}

export function renderPlain(ui: ReactElement): RenderResult & RenderedWithUser {
  const user = userEvent.setup();
  return { user, ...render(ui) };
}
