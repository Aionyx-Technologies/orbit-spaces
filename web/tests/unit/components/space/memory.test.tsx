import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FactForm } from "@/components/space/fact-form";
import type { FactFormProps } from "@/components/space/fact-form.types";
import { MemoryCard } from "@/components/space/memory-card";
import type { MemoryCardProps } from "@/components/space/memory-card.types";
import { FACT_KEY_MAX, FACT_VALUE_MAX } from "@/lib/constants";
import { ALEX_ID, makeFact } from "@/tests/unit/helpers/fixtures";
import {
  emptyResponse,
  errorResponse,
  jsonResponse,
  mockFetch,
} from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const MEMORY_URL = "/api/spaces/space-1/memory";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/space-1"),
}));

vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

function factResult(changed = true) {
  return {
    fact: makeFact({ key: "Budget", value: "$3,000" }),
    replaced_value: null,
    changed,
  };
}

function setupForm(overrides: Partial<FactFormProps> = {}) {
  const props: FactFormProps = {
    spaceId: "space-1",
    onSaved: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithProviders(<FactForm {...props} />) };
}

function setupCard(overrides: Partial<MemoryCardProps> = {}) {
  const props: MemoryCardProps = {
    spaceId: "space-1",
    facts: [makeFact()],
    meId: ALEX_ID,
    onSaved: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithProviders(<MemoryCard {...props} />) };
}

describe("FactForm", () => {
  it("asks for a name and a value, and focuses the name", () => {
    setupForm();

    expect(screen.getByRole("textbox", { name: "Fact name" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Fact value" })).toBeInTheDocument();
  });

  it("uses placeholders that name the field and never suggest an example value", () => {
    setupForm();

    expect(screen.getByRole("textbox", { name: "Fact name" })).toHaveAttribute(
      "placeholder",
      "Fact name",
    );
    expect(screen.getByRole("textbox", { name: "Fact value" })).toHaveAttribute(
      "placeholder",
      "Type the value",
    );
  });

  it("limits both fields to what the server accepts", () => {
    setupForm();

    expect(screen.getByRole("textbox", { name: "Fact name" })).toHaveAttribute(
      "maxlength",
      String(FACT_KEY_MAX),
    );
    expect(screen.getByRole("textbox", { name: "Fact value" })).toHaveAttribute(
      "maxlength",
      String(FACT_VALUE_MAX),
    );
  });

  it("cannot be saved until both fields have words", async () => {
    const { user } = setupForm();
    const save = screen.getByRole("button", { name: "Save fact" });
    expect(save).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Fact name" }), "Budget");
    expect(save).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Fact value" }), "   ");
    expect(save).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Fact value" }), "$3,000");
    expect(save).toBeEnabled();
  });

  it("saves, hands the result on and confirms", async () => {
    const mock = mockFetch({ [`PUT ${MEMORY_URL}`]: jsonResponse(factResult()) });
    const { props, user } = setupForm();
    await user.type(screen.getByRole("textbox", { name: "Fact name" }), "Budget");
    await user.type(screen.getByRole("textbox", { name: "Fact value" }), "$3,000");

    await user.click(screen.getByRole("button", { name: "Save fact" }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(factResult()));
    expect(mock.callsTo("PUT", MEMORY_URL)[0]?.json).toEqual({
      key: "Budget",
      value: "$3,000",
    });
    expect(toasts.success).toHaveBeenCalledWith("Fact saved");
  });

  it("says so when nothing changed", async () => {
    mockFetch({ [`PUT ${MEMORY_URL}`]: jsonResponse(factResult(false)) });
    const { user } = setupForm({ initialKey: "Budget", initialValue: "$3,000", lockKey: true });

    await user.click(screen.getByRole("button", { name: "Save fact" }));

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith("That fact already has this value"),
    );
  });

  it("locks the name when editing and starts in the value", () => {
    setupForm({ initialKey: "Dates", initialValue: "Dec 20 to 23", lockKey: true });

    const name = screen.getByRole("textbox", { name: "Fact name" });
    expect(name).toHaveValue("Dates");
    expect(name).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Fact value" })).toHaveValue("Dec 20 to 23");
    expect(screen.getByRole("textbox", { name: "Fact value" })).toHaveFocus();
  });

  it("cancels without saving", async () => {
    const mock = mockFetch({});
    const { props, user } = setupForm();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(mock.calls).toHaveLength(0);
  });

  it("shows the server's message and stays open", async () => {
    mockFetch({
      [`PUT ${MEMORY_URL}`]: errorResponse(
        409,
        "limit_reached",
        "This space already has 50 facts.",
      ),
    });
    const { props, user } = setupForm({ initialKey: "Budget", initialValue: "$3,000" });

    await user.click(screen.getByRole("button", { name: "Save fact" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This space already has 50 facts.");
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save fact" })).toBeEnabled();
  });

  it("sends a signed-out person to sign in", async () => {
    mockFetch({
      [`PUT ${MEMORY_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
    });
    const { user } = setupForm({ initialKey: "Budget", initialValue: "$3,000" });

    await user.click(screen.getByRole("button", { name: "Save fact" }));

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces%2Fspace-1"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows progress and locks Cancel while saving", async () => {
    const gate = Promise.withResolvers<Response>();
    mockFetch({ [`PUT ${MEMORY_URL}`]: () => gate.promise });
    const { props, user } = setupForm({ initialKey: "Budget", initialValue: "$3,000" });

    await user.click(screen.getByRole("button", { name: "Save fact" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    gate.resolve(jsonResponse(factResult()));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
  });
});

describe("MemoryCard", () => {
  beforeEach(() => {
    mockFetch({ [`PUT ${MEMORY_URL}`]: jsonResponse(factResult()) });
  });

  it("is a named region listing each fact with who set it", () => {
    setupCard({
      facts: [
        makeFact(),
        makeFact({
          key: "Hotel",
          value: "Seaside Inn",
          set_by: { user_id: "user-blake", display_name: "Blake", avatar_url: null },
          via: "Grok",
        }),
      ],
    });

    const region = screen.getByRole("region", { name: "Shared memory" });
    const facts = within(region).getAllByRole("listitem");
    expect(facts).toHaveLength(2);
    expect(within(facts[0] as HTMLElement).getByText("Dates")).toBeInTheDocument();
    expect(within(facts[0] as HTMLElement).getByText("Dec 20 to 23")).toBeInTheDocument();
    expect(within(facts[0] as HTMLElement).getByText("You")).toBeInTheDocument();
    expect(within(facts[1] as HTMLElement).getByText("Blake")).toBeInTheDocument();
    expect(within(facts[1] as HTMLElement).getByText(/via Grok/)).toBeInTheDocument();
  });

  it("explains what to put here when it is empty", () => {
    setupCard({ facts: [] });

    expect(screen.getByText(/No facts yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a fact" })).toBeInTheDocument();
  });

  it("lists the facts the template suggests that nobody has set, with their hints", () => {
    setupCard({
      unsetFacts: [
        { key: "Budget", hint: "Total for the trip" },
        { key: "Destination", hint: "" },
      ],
    });

    const suggested = screen.getByRole("list", { name: "Suggested facts" });
    const items = within(suggested).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Budget");
    expect(items[0]).toHaveTextContent("Total for the trip");
    expect(items[1]).toHaveTextContent("Destination");
    expect(
      within(items[0] as HTMLElement).getByRole("button", { name: "Add Budget" }),
    ).toHaveTextContent("Add");
  });

  it("shows no suggestions when there are none", () => {
    setupCard({ unsetFacts: [] });

    expect(screen.queryByRole("list", { name: "Suggested facts" })).not.toBeInTheDocument();
    expect(screen.queryByText("Suggested for this space")).not.toBeInTheDocument();
  });

  it("opens the fact form in the suggestion's own row, ready for the value", async () => {
    const { user } = setupCard({ unsetFacts: [{ key: "Budget", hint: "Total for the trip" }] });

    await user.click(screen.getByRole("button", { name: "Add Budget" }));

    const row = within(screen.getByRole("list", { name: "Suggested facts" })).getByRole("listitem");
    expect(within(row).getByRole("textbox", { name: "Fact value" })).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "Fact name" })).not.toBeInTheDocument();
  });

  it("edits a fact in its own row and returns focus to its edit button", async () => {
    const { user } = setupCard({
      facts: [makeFact({ key: "Dates", value: "Dec 20 to 23" }), makeFact({ key: "Budget" })],
    });

    await user.click(screen.getByRole("button", { name: "Edit Dates" }));

    const memory = screen.getByRole("region", { name: "Shared memory" });
    const rows = within(memory).getAllByRole("listitem");
    const value = within(rows[0] as HTMLElement).getByRole("textbox", { name: "Fact value" });
    expect(value).toHaveValue("Dec 20 to 23");
    expect(value).toHaveFocus();
    expect(within(rows[1] as HTMLElement).queryByRole("textbox")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "Fact value" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Dates" })).toHaveFocus();
  });

  it("saves a suggested fact under its suggested name", async () => {
    const mock = mockFetch({ [`PUT ${MEMORY_URL}`]: jsonResponse(factResult()) });
    const { props, user } = setupCard({
      unsetFacts: [{ key: "Budget", hint: "Total for the trip" }],
    });
    await user.click(screen.getByRole("button", { name: "Add Budget" }));

    await user.type(screen.getByRole("textbox", { name: "Fact value" }), "$3,000");
    await user.click(screen.getByRole("button", { name: "Save fact" }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(factResult()));
    expect(mock.callsTo("PUT", MEMORY_URL)[0]?.json).toEqual({ key: "Budget", value: "$3,000" });
  });

  it("switches from one suggestion to another, and lets any other fact still be added", async () => {
    const { user } = setupCard({
      unsetFacts: [
        { key: "Budget", hint: "" },
        { key: "Destination", hint: "" },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Add Budget" }));
    await user.click(screen.getByRole("button", { name: "Add Destination" }));
    const rows = within(screen.getByRole("list", { name: "Suggested facts" })).getAllByRole(
      "listitem",
    );
    expect(screen.getAllByRole("textbox", { name: "Fact value" })).toHaveLength(1);
    expect(
      within(rows[1] as HTMLElement).getByRole("textbox", { name: "Fact value" }),
    ).toHaveFocus();
    expect(screen.getByRole("button", { name: "Add Budget" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add a fact" }));

    const name = screen.getByRole("textbox", { name: "Fact name" });
    expect(name).toHaveValue("");
    expect(name).not.toHaveAttribute("readonly");
  });

  it("renders suggestion text as plain text", () => {
    const { container } = setupCard({
      unsetFacts: [{ key: "<b>Key</b>", hint: "<img src=x onerror=alert(1)>" }],
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>Key</b>")).toBeInTheDocument();
  });

  it("renders fact text as plain text", () => {
    const { container } = setupCard({
      facts: [makeFact({ key: "<b>Key</b>", value: "<img src=x onerror=alert(1)>" })],
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>Key</b>")).toBeInTheDocument();
  });

  it("adds a fact and returns to the button", async () => {
    const { props, user } = setupCard();

    await user.click(screen.getByRole("button", { name: "Add a fact" }));
    expect(screen.queryByRole("button", { name: "Add a fact" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Fact name" }), "Budget");
    await user.type(screen.getByRole("textbox", { name: "Fact value" }), "$3,000");
    await user.click(screen.getByRole("button", { name: "Save fact" }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(factResult()));
    expect(screen.queryByRole("textbox", { name: "Fact name" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a fact" })).toBeInTheDocument();
  });

  it("edits a fact's value in place, keeping its name", async () => {
    mockFetch({ [`PUT ${MEMORY_URL}`]: jsonResponse(factResult()) });
    const { props, user } = setupCard();

    await user.click(screen.getByRole("button", { name: "Edit Dates" }));

    expect(screen.getByRole("textbox", { name: "Fact name" })).toHaveValue("Dates");
    const value = screen.getByRole("textbox", { name: "Fact value" });
    expect(value).toHaveValue("Dec 20 to 23");
    await user.clear(value);
    await user.type(value, "Dec 21 to 24");
    await user.click(screen.getByRole("button", { name: "Save fact" }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("textbox", { name: "Fact value" })).not.toBeInTheDocument();
  });

  it("renames a fact without touching its value", async () => {
    const renamed = makeFact({ key: "Trip dates", value: "Dec 20 to 23" });
    const mock = mockFetch({
      [`POST ${MEMORY_URL}/rename`]: jsonResponse({
        fact: renamed,
        replaced_value: null,
        changed: true,
      }),
    });
    const { props, user } = setupCard();

    await user.click(screen.getByRole("button", { name: "Edit Dates" }));
    const name = screen.getByRole("textbox", { name: "Fact name" });
    await user.clear(name);
    await user.type(name, "Trip dates");
    await user.click(screen.getByRole("button", { name: "Save fact" }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(mock.callsTo("POST", `${MEMORY_URL}/rename`)[0]?.json).toEqual({
      key: "Dates",
      new_key: "Trip dates",
    });
    expect(mock.callsTo("PUT", MEMORY_URL)).toHaveLength(0);
    expect(props.onSaved).toHaveBeenCalledWith(
      { fact: renamed, replaced_value: null, changed: true },
      "Dates",
    );
  });

  it("renames and changes the value in one save", async () => {
    const renamed = makeFact({ key: "Trip dates", value: "Dec 20 to 23" });
    const updated = makeFact({ key: "Trip dates", value: "Dec 21 to 24" });
    const mock = mockFetch({
      [`POST ${MEMORY_URL}/rename`]: jsonResponse({
        fact: renamed,
        replaced_value: null,
        changed: true,
      }),
      [`PUT ${MEMORY_URL}`]: jsonResponse({
        fact: updated,
        replaced_value: "Dec 20 to 23",
        changed: true,
      }),
    });
    const { props, user } = setupCard();

    await user.click(screen.getByRole("button", { name: "Edit Dates" }));
    await user.clear(screen.getByRole("textbox", { name: "Fact name" }));
    await user.type(screen.getByRole("textbox", { name: "Fact name" }), "Trip dates");
    await user.clear(screen.getByRole("textbox", { name: "Fact value" }));
    await user.type(screen.getByRole("textbox", { name: "Fact value" }), "Dec 21 to 24");
    await user.click(screen.getByRole("button", { name: "Save fact" }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(mock.callsTo("PUT", MEMORY_URL)[0]?.json).toEqual({
      key: "Trip dates",
      value: "Dec 21 to 24",
    });
    expect(props.onSaved).toHaveBeenCalledWith(
      { fact: updated, replaced_value: "Dec 20 to 23", changed: true },
      "Dates",
    );
  });

  it("deletes a fact after asking, and says the change stays in the history", async () => {
    const mock = mockFetch({ [`DELETE ${MEMORY_URL}?key=Dates`]: emptyResponse() });
    const { props, user } = setupCard();

    await user.click(screen.getByRole("button", { name: "Edit Dates" }));
    await user.click(screen.getByRole("button", { name: "Delete Dates" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Delete “Dates”?" });
    expect(dialog).toHaveTextContent(/kept in the memory history/);
    await user.click(within(dialog).getByRole("button", { name: "Delete fact" }));

    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith("Dates"));
    expect(mock.callsTo("DELETE", `${MEMORY_URL}?key=Dates`)).toHaveLength(1);
  });

  it("keeps the fact when the person changes their mind about deleting", async () => {
    const mock = mockFetch({});
    const { props, user } = setupCard();

    await user.click(screen.getByRole("button", { name: "Edit Dates" }));
    await user.click(screen.getByRole("button", { name: "Delete Dates" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(props.onDeleted).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it("shows one fact's history, following its earlier name", async () => {
    mockFetch({
      [`GET ${MEMORY_URL}/history?key=Dates`]: jsonResponse({
        entries: [
          {
            action: "rename",
            key: "Dates",
            previous_key: "When",
            value: "Dec 20 to 23",
            previous_value: null,
            by: { user_id: ALEX_ID, display_name: "Alex", avatar_url: null },
            via: "web",
            at: "2026-11-21T10:00:00Z",
          },
          {
            action: "edit",
            key: "When",
            previous_key: null,
            value: "Dec 20 to 23",
            previous_value: "Dec 19 to 22",
            by: { user_id: "blake", display_name: "Blake", avatar_url: null },
            via: "Grok",
            at: "2026-11-20T10:00:00Z",
          },
        ],
      }),
    });
    const { user } = setupCard();

    await user.click(screen.getByRole("button", { name: "History of Dates" }));

    const dialog = await screen.findByRole("dialog", { name: "History of Dates" });
    const changes = await within(dialog).findAllByRole("listitem");
    expect(changes[0]).toHaveTextContent("Renamed When to Dates");
    expect(changes[1]).toHaveTextContent("Changed When");
    expect(changes[1]).toHaveTextContent("Dec 19 to 22");
    expect(changes[1]).toHaveTextContent("Blake");
  });

  it("shows the whole space's memory history, including deletions", async () => {
    mockFetch({
      [`GET ${MEMORY_URL}/history`]: jsonResponse({
        entries: [
          {
            action: "delete",
            key: "Hotel",
            previous_key: null,
            value: "Seaside Inn",
            previous_value: null,
            by: null,
            via: "Claude",
            at: "2026-11-21T10:00:00Z",
          },
        ],
      }),
    });
    const { user } = setupCard();

    await user.click(screen.getByRole("button", { name: "Memory history" }));

    const dialog = await screen.findByRole("dialog", { name: "Memory history" });
    const change = await within(dialog).findByRole("listitem");
    expect(change).toHaveTextContent("Deleted Hotel");
    expect(change).toHaveTextContent("Seaside Inn");
  });

  it("cancels adding", async () => {
    const { user } = setupCard();
    await user.click(screen.getByRole("button", { name: "Add a fact" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox", { name: "Fact name" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a fact" })).toBeInTheDocument();
  });

  it("switches from one edit to another cleanly", async () => {
    const { user } = setupCard({
      facts: [makeFact(), makeFact({ key: "Hotel", value: "Seaside Inn" })],
    });

    await user.click(screen.getByRole("button", { name: "Edit Dates" }));
    await user.click(screen.getByRole("button", { name: "Edit Hotel" }));

    expect(screen.getAllByRole("textbox", { name: "Fact value" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Fact value" })).toHaveValue("Seaside Inn");
    expect(screen.getByText("Dec 20 to 23")).toBeInTheDocument();
  });
});
