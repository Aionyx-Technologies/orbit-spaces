import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewSpaceDialog } from "@/components/spaces/new-space-dialog";
import type { SpaceSuggestion } from "@/lib/api.types";
import type { Routes } from "@/tests/unit/helpers/mock-fetch.types";
import {
  FAMILY_VACATION,
  makeMe,
  makeSpaceSummary,
  makeTemplate,
} from "@/tests/unit/helpers/fixtures";
import { errorResponse, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({ navigateTo: vi.fn(), currentPath: vi.fn(() => "/spaces") }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

const PURPOSE = "Goa trip with college friends, Dec 20–27, 6 of us, about ₹15k each";
const TRIP = makeTemplate({ ...FAMILY_VACATION, icon: "✈️" });
const HOUSEHOLD = makeTemplate({
  id: "household",
  name: "Household",
  icon: "🏠",
  description: "Run a shared home",
  facts: [
    { key: "Address", hint: "Where you live" },
    { key: "Rent day", hint: "When rent is due" },
  ],
  plan_sections: ["Bills", "Chores", "To settle"],
});
const BLANK = makeTemplate({ name: "Blank", description: "Start from nothing" });
const GOA = makeTemplate({
  id: "custom",
  name: "Goa trip",
  description: "Six friends planning a December week by the sea",
  facts: [
    { key: "Dates", hint: "When you are travelling" },
    { key: "Headcount", hint: "How many are going" },
    { key: "Budget", hint: "Per person" },
    { key: "Stay", hint: "Where you sleep" },
  ],
  plan_sections: ["Where to stay", "Getting there", "Daily outline", "To settle"],
  combine_hint: "Keep it within budget.",
  tips: ["Share a hotel shortlist"],
});
const SUGGESTION: SpaceSuggestion = {
  suggested: true,
  name: "Goa trip",
  template: GOA,
  base_template_id: "trip",
  facts: [
    { key: "Dates", value: "Dec 20–27" },
    { key: "Headcount", value: "6" },
    { key: "Budget", value: "₹15,000 each" },
  ],
};
const GOA_INPUT = {
  name: "Goa trip",
  description: "Six friends planning a December week by the sea",
  facts: GOA.facts,
  plan_sections: ["Where to stay", "Getting there", "Daily outline", "To settle"],
  combine_hint: "Keep it within budget.",
  tips: ["Share a hotel shortlist"],
};

function routes(overrides: Routes = {}, meOverrides = {}): Routes {
  return {
    "GET /api/templates": jsonResponse({ templates: [TRIP, HOUSEHOLD, BLANK] }),
    "GET /api/me": jsonResponse(makeMe(meOverrides)),
    "POST /api/spaces": jsonResponse(makeSpaceSummary({ id: "new-space" }), 201),
    ...overrides,
  };
}

function setup() {
  return renderWithProviders(
    <NewSpaceDialog>
      <button type="button">New space</button>
    </NewSpaceDialog>,
  );
}

async function openDialog(view: ReturnType<typeof setup>, draftEnabled = true) {
  await view.user.click(screen.getByRole("button", { name: "New space" }));
  await screen.findByRole("button", { name: "🏠 Household" });
  if (draftEnabled) {
    await screen.findByRole("textbox", { name: "What's this space for?" });
  } else {
    await screen.findByRole("heading", { name: "Pick a starting point" });
  }
}

async function askFor(view: ReturnType<typeof setup>, purpose: string) {
  await view.user.click(question());
  await view.user.paste(purpose);
  await view.user.keyboard("{Enter}");
}

function question() {
  return screen.getByRole("textbox", { name: "What's this space for?" });
}

function nameField() {
  return screen.getByRole("textbox", { name: "Space name" });
}

function createButton() {
  return screen.getByRole("button", { name: "Create space" });
}

async function suggest(view: ReturnType<typeof setup>) {
  await askFor(view, PURPOSE);
  await screen.findByText("Dec 20–27");
}

describe("NewSpaceDialog", () => {
  beforeEach(() => {
    router.push.mockClear();
    toasts.success.mockClear();
    navigation.navigateTo.mockClear();
  });

  it("asks one question with the box focused, and no panel yet", async () => {
    mockFetch(routes());
    const view = setup();
    await openDialog(view);

    expect(screen.getByRole("dialog", { name: "What's this space for?" })).toBeInTheDocument();
    await waitFor(() => expect(question()).toHaveFocus());
    expect(question()).toHaveAttribute("maxlength", "280");
    expect(question()).toHaveAttribute(
      "placeholder",
      "Vegas weekend with college friends, Dec 19–21, 6 of us, about $3,000 each",
    );
    expect(screen.getByRole("button", { name: "Set it up" })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "Space name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create space" })).not.toBeInTheDocument();
  });

  it("shows the template chips in order with Blank last", async () => {
    mockFetch(routes());
    const view = setup();
    await openDialog(view);

    const chips = within(screen.getByRole("group", { name: "Starting points" })).getAllByRole(
      "button",
    );
    expect(chips.map((chip) => chip.textContent)).toEqual(["✈️ Trip", "🏠 Household", "Blank"]);
    expect(chips.every((chip) => chip.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("suggests from a sentence and creates with switched-on facts", async () => {
    const mock = mockFetch(routes({ "POST /api/spaces/suggest": jsonResponse(SUGGESTION) }));
    const view = setup();
    await openDialog(view);

    await suggest(view);

    expect(mock.callsTo("POST", "/api/spaces/suggest")[0]?.json).toEqual({ purpose: PURPOSE });
    expect(nameField()).toHaveValue("Goa trip");
    expect(screen.getByText("Suggested")).toBeInTheDocument();
    expect(screen.getByText("Six friends planning a December week by the sea")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Dates" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Stay" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Stay" })).toBeDisabled();
    expect(screen.getByText("Not set yet")).toBeInTheDocument();

    await view.user.click(createButton());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces/new-space"));
    expect(mock.callsTo("POST", "/api/spaces")[0]?.json).toEqual({
      name: "Goa trip",
      template: GOA_INPUT,
      facts: [
        { key: "Dates", value: "Dec 20–27", suggested: true },
        { key: "Headcount", value: "6", suggested: true },
        { key: "Budget", value: "₹15,000 each", suggested: true },
      ],
    });
    expect(toasts.success).toHaveBeenCalledWith("Space created");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds a new line on Shift+Enter instead of setting up", async () => {
    const mock = mockFetch(routes());
    const view = setup();
    await openDialog(view);

    await view.user.type(question(), "Goa{Shift>}{Enter}{/Shift}trip");

    expect(question()).toHaveValue("Goa\ntrip");
    expect(mock.callsTo("POST", "/api/spaces/suggest")).toHaveLength(0);
  });

  it("sends suggested false for an edited value", async () => {
    const mock = mockFetch(routes({ "POST /api/spaces/suggest": jsonResponse(SUGGESTION) }));
    const view = setup();
    await openDialog(view);
    await suggest(view);

    await view.user.click(screen.getByRole("button", { name: "Budget: ₹15,000 each" }));
    const budget = screen.getByRole("textbox", { name: "Budget value" });
    expect(budget).toHaveFocus();
    await view.user.clear(budget);
    await view.user.type(budget, "₹20,000 each{Enter}");
    expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(0);
    await view.user.click(createButton());

    await waitFor(() => expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(1));
    const body = mock.callsTo("POST", "/api/spaces")[0]?.json as { facts: unknown[] };
    expect(body.facts).toContainEqual({ key: "Budget", value: "₹20,000 each", suggested: false });
    expect(body.facts).toContainEqual({ key: "Dates", value: "Dec 20–27", suggested: true });
  });

  it("switches an empty fact on when a value is typed into it", async () => {
    const mock = mockFetch(routes({ "POST /api/spaces/suggest": jsonResponse(SUGGESTION) }));
    const view = setup();
    await openDialog(view);
    await suggest(view);

    await view.user.click(screen.getByRole("button", { name: "Stay: Not set yet" }));
    await view.user.type(screen.getByRole("textbox", { name: "Stay value" }), "Beach hut");
    expect(screen.getByRole("switch", { name: "Stay" })).toBeChecked();
    await view.user.click(createButton());

    await waitFor(() => expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(1));
    const body = mock.callsTo("POST", "/api/spaces")[0]?.json as { facts: unknown[] };
    expect(body.facts).toContainEqual({ key: "Stay", value: "Beach hut", suggested: false });
  });

  it("does not send facts that are switched off", async () => {
    const mock = mockFetch(routes({ "POST /api/spaces/suggest": jsonResponse(SUGGESTION) }));
    const view = setup();
    await openDialog(view);
    await suggest(view);

    await view.user.click(screen.getByRole("switch", { name: "Headcount" }));
    expect(screen.getByRole("switch", { name: "Headcount" })).not.toBeChecked();
    await view.user.click(createButton());

    await waitFor(() => expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(1));
    const body = mock.callsTo("POST", "/api/spaces")[0]?.json as { facts: { key: string }[] };
    expect(body.facts.map((fact) => fact.key)).toEqual(["Dates", "Budget"]);
  });

  it("chip path makes no AI call and leaves the name empty", async () => {
    const mock = mockFetch(routes());
    const view = setup();
    await openDialog(view);

    await view.user.click(screen.getByRole("button", { name: "🏠 Household" }));

    expect(screen.getByRole("button", { name: "🏠 Household" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(mock.callsTo("POST", "/api/spaces/suggest")).toHaveLength(0);
    expect(nameField()).toHaveValue("");
    expect(nameField()).toHaveAttribute("placeholder", "Flat 4B");
    await waitFor(() => expect(nameField()).toHaveFocus());
    expect(screen.getByText("Run a shared home")).toBeInTheDocument();
    expect(screen.getAllByText("Not set yet")).toHaveLength(2);
    expect(screen.queryByText("Suggested")).not.toBeInTheDocument();
    expect(createButton()).toBeDisabled();

    await view.user.type(nameField(), "Flat 12");
    await view.user.click(createButton());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces/new-space"));
    expect(mock.callsTo("POST", "/api/spaces")[0]?.json).toEqual({
      name: "Flat 12",
      template_id: "household",
    });
  });

  it("creates on Enter in the name field", async () => {
    const mock = mockFetch(routes());
    const view = setup();
    await openDialog(view);
    await view.user.click(screen.getByRole("button", { name: "Blank" }));

    await view.user.type(nameField(), "Book club{Enter}");

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces/new-space"));
    expect(mock.callsTo("POST", "/api/spaces")[0]?.json).toEqual({
      name: "Book club",
      template_id: "general",
    });
  });

  it("ignores a suggestion that finishes after a chip was chosen", async () => {
    const gate = Promise.withResolvers<Response>();
    mockFetch(routes({ "POST /api/spaces/suggest": () => gate.promise }));
    const view = setup();
    await openDialog(view);

    await askFor(view, PURPOSE);
    expect(screen.getByRole("button", { name: "Setting up…" })).toBeEnabled();
    await view.user.click(screen.getByRole("button", { name: "🏠 Household" }));
    gate.resolve(jsonResponse(SUGGESTION));

    await waitFor(() => expect(screen.getByRole("button", { name: "Set it up" })).toBeEnabled());
    expect(nameField()).toHaveValue("");
    expect(nameField()).toHaveAttribute("placeholder", "Flat 4B");
    expect(screen.queryByText("Dec 20–27")).not.toBeInTheDocument();
    expect(question()).toHaveValue(PURPOSE);
  });

  it("lets a newer Set it up replace one still in flight", async () => {
    const first = Promise.withResolvers<Response>();
    let calls = 0;
    const mock = mockFetch(
      routes({
        "POST /api/spaces/suggest": () => {
          calls += 1;
          return calls === 1
            ? first.promise
            : Promise.resolve(jsonResponse({ ...SUGGESTION, name: "Goa getaway" }));
        },
      }),
    );
    const view = setup();
    await openDialog(view);

    await view.user.type(question(), "Goa trip{Enter}");
    await view.user.type(question(), " by the sea");
    await view.user.click(screen.getByRole("button", { name: "Setting up…" }));
    expect(await screen.findByDisplayValue("Goa getaway")).toBeInTheDocument();
    first.resolve(jsonResponse(SUGGESTION));

    await waitFor(() => expect(mock.callsTo("POST", "/api/spaces/suggest")).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(nameField()).toHaveValue("Goa getaway");
    expect(mock.callsTo("POST", "/api/spaces/suggest")[1]?.json).toEqual({
      purpose: "Goa trip by the sea",
    });
  });

  it("shows the template icon on its chip only, not on the space", async () => {
    mockFetch(routes());
    const view = setup();
    await openDialog(view);

    await view.user.click(screen.getByRole("button", { name: "🏠 Household" }));

    expect(screen.getAllByText("🏠")).toHaveLength(1);
  });

  it("does not create the space when Enter is pressed inside the customize form", async () => {
    const mock = mockFetch(routes());
    const view = setup();
    await openDialog(view);
    await view.user.click(screen.getByRole("button", { name: "🏠 Household" }));
    await view.user.type(nameField(), "Flat 12");
    await view.user.click(screen.getByRole("button", { name: "Customize" }));

    await view.user.type(screen.getByRole("textbox", { name: "Template name" }), " two{Enter}");

    expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(0);
    expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("Household two");
  });

  it("cancels an inline fact edit on Escape and keeps the dialog open", async () => {
    mockFetch(routes({ "POST /api/spaces/suggest": jsonResponse(SUGGESTION) }));
    const view = setup();
    await openDialog(view);
    await suggest(view);

    await view.user.click(screen.getByRole("button", { name: "Budget: ₹15,000 each" }));
    await view.user.type(screen.getByRole("textbox", { name: "Budget value" }), " or so");
    await view.user.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Budget value" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Budget: ₹15,000 each" })).toHaveFocus();
    expect(nameField()).toHaveValue("Goa trip");
  });

  it("shows the notice and keeps chips usable when suggesting fails", async () => {
    const mock = mockFetch(
      routes({
        "POST /api/spaces/suggest": errorResponse(503, "unavailable", "The AI service is busy."),
      }),
    );
    const view = setup();
    await openDialog(view);

    await askFor(view, PURPOSE);

    expect(
      await screen.findByText("Orbit couldn't set that up. Pick a starting point below."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Space name" })).not.toBeInTheDocument();
    await view.user.click(screen.getByRole("button", { name: "✈️ Trip" }));
    await view.user.type(nameField(), "Lisbon");
    await view.user.click(createButton());
    await waitFor(() => expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(1));
    expect(mock.callsTo("POST", "/api/spaces")[0]?.json).toEqual({
      name: "Lisbon",
      template_id: "trip",
    });
  });

  it("shows the server's message when the daily limit is reached", async () => {
    mockFetch(
      routes({
        "POST /api/spaces/suggest": errorResponse(
          429,
          "rate_limited",
          "You have used all your suggestions for today. Try again tomorrow.",
        ),
      }),
    );
    const view = setup();
    await openDialog(view);

    await askFor(view, PURPOSE);

    expect(
      await screen.findByText("You have used all your suggestions for today. Try again tomorrow."),
    ).toBeInTheDocument();
  });

  it("shows Blank with the notice when Orbit could not suggest a space", async () => {
    const mock = mockFetch(
      routes({
        "POST /api/spaces/suggest": jsonResponse({
          ...SUGGESTION,
          suggested: false,
          name: "",
          template: BLANK,
          base_template_id: "general",
          facts: [],
        }),
      }),
    );
    const view = setup();
    await openDialog(view);

    await view.user.type(question(), "asdf{Enter}");

    expect(
      await screen.findByText("Orbit couldn't set that up. Pick a starting point below."),
    ).toBeInTheDocument();
    expect(screen.getByText("Start from nothing")).toBeInTheDocument();
    expect(screen.queryByText("Suggested")).not.toBeInTheDocument();
    await view.user.type(nameField(), "Odds and ends");
    await view.user.click(createButton());
    await waitFor(() => expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(1));
    expect(mock.callsTo("POST", "/api/spaces")[0]?.json).toEqual({
      name: "Odds and ends",
      template_id: "general",
    });
  });

  it("hides the box when drafting is not set up", async () => {
    mockFetch(routes({}, { draft_enabled: false }));
    const view = setup();
    await openDialog(view, false);

    expect(screen.getByRole("heading", { name: "Pick a starting point" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "What's this space for?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set it up" })).toBeNull();
  });

  it("customize adds a fact row", async () => {
    const mock = mockFetch(routes({ "POST /api/spaces/suggest": jsonResponse(SUGGESTION) }));
    const view = setup();
    await openDialog(view);
    await suggest(view);

    await view.user.click(screen.getByRole("button", { name: "Customize" }));
    await view.user.click(screen.getByRole("button", { name: "Add a suggested fact" }));
    await view.user.type(screen.getByRole("textbox", { name: "Fact 5 name" }), "Flights");

    expect(screen.getByRole("switch", { name: "Flights" })).toBeDisabled();
    expect(screen.getAllByText("Not set yet")).toHaveLength(2);
    await view.user.click(createButton());
    await waitFor(() => expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(1));
    const body = mock.callsTo("POST", "/api/spaces")[0]?.json as {
      template: { facts: { key: string }[] };
    };
    expect(body.template.facts.map((fact) => fact.key)).toContain("Flights");
  });

  it("sends the edited template once a chip is customized, and needs a template name", async () => {
    const mock = mockFetch(routes());
    const view = setup();
    await openDialog(view);
    await view.user.click(screen.getByRole("button", { name: "🏠 Household" }));
    await view.user.type(nameField(), "Flat 12");

    await view.user.click(screen.getByRole("button", { name: "Customize" }));
    const templateName = screen.getByRole("textbox", { name: "Template name" });
    await view.user.clear(templateName);
    expect(createButton()).toBeDisabled();
    await view.user.type(templateName, "Our flat");
    await view.user.click(createButton());

    await waitFor(() => expect(mock.callsTo("POST", "/api/spaces")).toHaveLength(1));
    const body = mock.callsTo("POST", "/api/spaces")[0]?.json as {
      template: { name: string };
      template_id?: string;
    };
    expect(body.template.name).toBe("Our flat");
    expect(body.template_id).toBeUndefined();
  });

  it("shows the server's message and keeps the dialog open when creating fails", async () => {
    mockFetch(
      routes({
        "POST /api/spaces": errorResponse(
          409,
          "limit_reached",
          "You can belong to at most 50 spaces.",
        ),
      }),
    );
    const view = setup();
    await openDialog(view);
    await view.user.click(screen.getByRole("button", { name: "Blank" }));
    await view.user.type(nameField(), "One too many{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can belong to at most 50 spaces.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(createButton()).toBeEnabled();
  });

  it("sends a signed-out person to sign in", async () => {
    mockFetch(
      routes({ "POST /api/spaces": errorResponse(401, "unauthenticated", "Sign in to continue.") }),
    );
    const view = setup();
    await openDialog(view);
    await view.user.click(screen.getByRole("button", { name: "Blank" }));

    await view.user.type(nameField(), "Trip{Enter}");

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith("/auth/sign-in?next=%2Fspaces"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("starts over when closed and opened again", async () => {
    mockFetch(routes({ "POST /api/spaces/suggest": jsonResponse(SUGGESTION) }));
    const view = setup();
    await openDialog(view);
    await suggest(view);

    await view.user.click(screen.getByRole("button", { name: "Close" }));
    await openDialog(view);

    expect(question()).toHaveValue("");
    expect(screen.queryByRole("textbox", { name: "Space name" })).not.toBeInTheDocument();
  });

  it("limits the name length", async () => {
    mockFetch(routes());
    const view = setup();
    await openDialog(view);
    await view.user.click(screen.getByRole("button", { name: "Blank" }));

    expect(nameField()).toHaveAttribute("maxlength", "100");
  });

  it("still offers Blank when the templates cannot be loaded", async () => {
    const mock = mockFetch(
      routes({ "GET /api/templates": errorResponse(500, "server_error", "Something broke.") }),
    );
    const view = setup();
    await view.user.click(screen.getByRole("button", { name: "New space" }));

    expect(await screen.findByText(/Templates couldn't be loaded/)).toBeInTheDocument();
    await view.user.click(screen.getByRole("button", { name: "Blank" }));
    await view.user.type(nameField(), "Trip{Enter}");

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/spaces/new-space"));
    expect(mock.callsTo("POST", "/api/spaces")[0]?.json).toEqual({
      name: "Trip",
      template_id: "general",
    });
  });

  it("shows suggested text as plain text", async () => {
    mockFetch(
      routes({
        "POST /api/spaces/suggest": jsonResponse({
          ...SUGGESTION,
          template: { ...GOA, description: "<img src=x onerror=alert(1)>" },
          facts: [{ key: "Dates", value: "<b>Dec 20–27</b>" }],
        }),
      }),
    );
    const view = setup();
    await openDialog(view);

    await askFor(view, PURPOSE);

    expect(await screen.findByText("<b>Dec 20–27</b>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
  });
});
