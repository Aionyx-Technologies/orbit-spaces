import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpaceScreen } from "@/components/space/space-screen";
import type { SpaceScreenProps } from "@/components/space/space-screen.types";
import { FakeEventSource } from "@/tests/unit/helpers/fake-event-source";
import { stubImage } from "@/tests/unit/helpers/photo-stubs";
import {
  ALEX,
  BLAKE,
  FAMILY_VACATION,
  makeFact,
  makeItem,
  makeItemsPage,
  makeMe,
  makeMember,
  makePlan,
  makeSpaceDetail,
  makeTemplate,
} from "@/tests/unit/helpers/fixtures";
import {
  emptyResponse,
  errorResponse,
  jsonResponse,
  mockFetch,
} from "@/tests/unit/helpers/mock-fetch";
import type { FetchMock } from "@/tests/unit/helpers/mock-fetch.types";
import { renderWithProviders } from "@/tests/unit/helpers/render";

const SPACE_URL = "/api/spaces/space-1";
const FIRST_PAGE_URL = "/api/spaces/space-1/items?limit=20";
const ANNOUNCEMENT = "New activity in this space";
const OFFLINE_NOTICE = "Live updates are paused. Trying to reconnect…";

const MORNING = makeItem({
  id: "item-1",
  title: "Morning flight",
  created_at: "2026-11-19T10:00:00Z",
});
const HOTELS = makeItem({
  id: "item-2",
  title: "Hotel shortlist",
  content: "Seaside Inn",
  created_at: "2026-11-19T09:00:00Z",
});

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navigation = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  currentPath: vi.fn(() => "/spaces/space-1"),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/navigation", () => navigation);

function renderScreen(overrides: Partial<SpaceScreenProps> = {}) {
  const props: SpaceScreenProps = {
    me: makeMe(),
    initialSpace: makeSpaceDetail(),
    initialFeed: makeItemsPage([MORNING, HOTELS]),
    ...overrides,
  };
  return { props, ...renderWithProviders(<SpaceScreen {...props} />) };
}

function emit(type: string, data: object = {}) {
  act(() => FakeEventSource.latest.emit(type, data));
}

function callsOtherThanReading(mock: FetchMock) {
  return mock.calls.filter((call) => !call.url.endsWith("/read"));
}

function titlesInFeed(): string[] {
  return screen
    .getAllByRole("article")
    .map((article) => within(article).getByRole("heading").textContent ?? "");
}

describe("SpaceScreen", () => {
  beforeEach(() => {
    FakeEventSource.reset();
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("on first view", () => {
    it("shows the header, the share box, the feed, the shared memory and the members", () => {
      renderScreen();

      expect(screen.getByRole("heading", { level: 1, name: "Goa trip" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Share something" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Feed" })).toBeInTheDocument();
      expect(titlesInFeed()).toEqual(["Morning flight", "Hotel shortlist"]);
      const aside = screen.getByRole("complementary", { name: "About this space" });
      expect(within(aside).getByRole("region", { name: "Shared memory" })).toHaveTextContent(
        "Dec 20 to 23",
      );
      expect(within(aside).getByRole("list", { name: "2 members" })).toBeInTheDocument();
    });

    it("fetches nothing on its own because the server already supplied the data", () => {
      const mock = mockFetch({});

      renderScreen();

      expect(callsOtherThanReading(mock)).toHaveLength(0);
    });

    it("listens for live updates for this space and stops when it goes away", () => {
      const { unmount } = renderScreen();

      expect(FakeEventSource.latest.url).toBe("/api/spaces/space-1/events");
      expect(FakeEventSource.instances).toHaveLength(1);

      unmount();

      expect(FakeEventSource.latest.closed).toBe(true);
    });

    it("hides the plan card when there is no plan and combining is off", () => {
      renderScreen({ me: makeMe({ combine_enabled: false }) });

      expect(screen.queryByRole("region", { name: "Latest plan" })).not.toBeInTheDocument();
    });

    it("offers Combine when there is no plan yet and combining is on", () => {
      renderScreen();

      const region = screen.getByRole("region", { name: "Latest plan" });
      expect(within(region).getByRole("button", { name: "Combine" })).toBeInTheDocument();
    });

    it("shows an existing plan without Combine when combining is off", () => {
      renderScreen({
        me: makeMe({ combine_enabled: false }),
        initialSpace: makeSpaceDetail({ latest_plan: makePlan() }),
      });

      const region = screen.getByRole("region", { name: "Latest plan" });
      expect(region).toHaveTextContent("Stay at Hotel 2.");
      expect(within(region).queryByRole("button", { name: "Combine" })).not.toBeInTheDocument();
    });

    it("lists the latest plan once, in its own card, and not again in the feed", () => {
      const plan = makePlan();
      renderScreen({
        initialSpace: makeSpaceDetail({ latest_plan: plan }),
        initialFeed: makeItemsPage([plan, MORNING]),
      });

      expect(screen.getByRole("region", { name: "Latest plan" })).toHaveTextContent(
        "Stay at Hotel 2.",
      );
      expect(titlesInFeed()).toEqual(["Morning flight"]);
    });
  });

  describe("sharing", () => {
    it("puts what you share at the top of the feed straight away and announces it", async () => {
      const created = makeItem({
        id: "item-new",
        title: "Hello there",
        content: "Hello there",
        created_at: "2026-11-19T11:00:00Z",
        can_retract: true,
      });
      mockFetch({ [`POST ${SPACE_URL}/items`]: jsonResponse(created, 201) });
      const { user } = renderScreen();

      await user.type(screen.getByRole("textbox", { name: "Share something" }), "Hello there");
      await user.click(screen.getByRole("button", { name: "Share" }));

      const article = await screen.findByRole("article", { name: "Hello there" });
      expect(article).toHaveAttribute("data-fresh", "true");
      expect(titlesInFeed()).toEqual(["Hello there", "Morning flight", "Hotel shortlist"]);
      expect(screen.getByText(ANNOUNCEMENT)).toBeInTheDocument();
      expect(
        within(article).getByRole("button", { name: "Retract Hello there" }),
      ).toBeInTheDocument();
    });
  });

  describe("live updates", () => {
    it("adds an item that arrives from someone else and marks only that one as new", async () => {
      const arrived = makeItem({
        id: "item-3",
        title: "Taxi booked",
        created_at: "2026-11-19T11:00:00Z",
      });
      const mock = mockFetch({
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([arrived, MORNING, HOTELS])),
      });
      renderScreen();

      emit("item_added", { item_id: "item-3" });

      const article = await screen.findByRole("article", { name: "Taxi booked" });
      expect(article).toHaveAttribute("data-fresh", "true");
      expect(screen.getByRole("article", { name: "Morning flight" })).not.toHaveAttribute(
        "data-fresh",
      );
      expect(screen.getByText(ANNOUNCEMENT)).toBeInTheDocument();
      expect(mock.callsTo("GET", FIRST_PAGE_URL)).toHaveLength(1);
    });

    it("removes a retracted item at once, without announcing anything", async () => {
      const mock = mockFetch({
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([HOTELS])),
      });
      renderScreen();

      emit("item_retracted", { item_id: "item-1" });

      expect(screen.queryByRole("article", { name: "Morning flight" })).not.toBeInTheDocument();
      await waitFor(() => expect(mock.callsTo("GET", FIRST_PAGE_URL)).toHaveLength(1));
      await act(async () => {
        await Promise.resolve();
      });
      expect(titlesInFeed()).toEqual(["Hotel shortlist"]);
      expect(screen.queryByText(ANNOUNCEMENT)).not.toBeInTheDocument();
    });

    it("refreshes after a retraction it cannot identify", async () => {
      const mock = mockFetch({
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([MORNING])),
      });
      renderScreen();

      emit("item_retracted", { item_id: 42 });

      expect(screen.getByRole("article", { name: "Morning flight" })).toBeInTheDocument();
      await waitFor(() => expect(mock.callsTo("GET", FIRST_PAGE_URL)).toHaveLength(1));
      await waitFor(() => expect(titlesInFeed()).toEqual(["Morning flight"]));
    });

    it("shows a new plan in the plan card and not twice", async () => {
      const plan = makePlan({
        id: "plan-2",
        content: "Fresh plan body",
        created_at: "2026-11-19T12:00:00Z",
      });
      mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(makeSpaceDetail({ latest_plan: plan })),
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([plan, MORNING, HOTELS])),
      });
      renderScreen();

      emit("plan_added", { item_id: "plan-2" });

      await waitFor(() =>
        expect(screen.getByRole("region", { name: "Latest plan" })).toHaveTextContent(
          "Fresh plan body",
        ),
      );
      await waitFor(() => expect(titlesInFeed()).toEqual(["Morning flight", "Hotel shortlist"]));
    });

    it("shows a fact someone else saved", async () => {
      mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(
          makeSpaceDetail({
            memory: [makeFact(), makeFact({ key: "Budget", value: "$3,000" })],
          }),
        ),
      });
      renderScreen();

      emit("memory_set", { key: "Budget" });

      expect(await screen.findByText("$3,000")).toBeInTheDocument();
      expect(screen.getByText("Budget")).toBeInTheDocument();
    });

    it("shows someone who just joined", async () => {
      const casey = makeMember({ user_id: "user-casey", display_name: "Casey", is_you: false });
      mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(makeSpaceDetail({ members: [ALEX, BLAKE, casey] })),
      });
      renderScreen();

      emit("member_joined", { user_id: "user-casey" });

      expect(await screen.findByRole("list", { name: "3 members" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Alex, Blake, Casey" })).toBeInTheDocument();
    });

    it("refetches the space and the feed when someone changes their profile", async () => {
      const mock = mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(
          makeSpaceDetail({
            members: [ALEX, { ...BLAKE, about: "Window seat, always.", display_name: "Blake B" }],
          }),
        ),
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([MORNING, HOTELS])),
      });
      renderScreen();

      emit("profile_changed", { user_id: "user-blake" });

      await waitFor(() => expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(1));
      await waitFor(() => expect(mock.callsTo("GET", FIRST_PAGE_URL)).toHaveLength(1));
      const panel = screen.getByRole("region", { name: "Members" });
      expect(
        await within(panel).findByRole("button", { name: "Blake B's profile" }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Blake B's profile" }).length).toBeGreaterThan(
        1,
      );
    });

    it("does not call a profile change new activity", async () => {
      const mock = mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(makeSpaceDetail()),
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([MORNING, HOTELS])),
      });
      renderScreen();

      emit("profile_changed", { user_id: "user-blake" });

      await waitFor(() => expect(mock.callsTo("GET", FIRST_PAGE_URL)).toHaveLength(1));
      expect(screen.queryByText(ANNOUNCEMENT)).not.toBeInTheDocument();
      expect(document.querySelectorAll("[data-fresh='true']")).toHaveLength(0);
    });

    it("shows a member's new photo in the members list, the feed and the shared memory", async () => {
      const photo = "/api/users/user-blake/avatar?v=9";
      const blake = { ...BLAKE, avatar_url: photo };
      mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(
          makeSpaceDetail({
            members: [ALEX, blake],
            memory: [
              makeFact({
                set_by: { user_id: "user-blake", display_name: "Blake", avatar_url: photo },
              }),
            ],
          }),
        ),
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(
          makeItemsPage([
            makeItem({
              shared_by: { user_id: "user-blake", display_name: "Blake", avatar_url: photo },
            }),
          ]),
        ),
      });
      stubImage({ width: 256, height: 256 });
      renderScreen();

      emit("profile_changed", { user_id: "user-blake" });

      await waitFor(() =>
        expect(
          [...document.querySelectorAll("img")].filter(
            (image) => image.getAttribute("src") === photo,
          ).length,
        ).toBeGreaterThanOrEqual(3),
      );
    });

    it("catches up on everything when the server asks for a resync", async () => {
      const mock = mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(makeSpaceDetail()),
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([MORNING, HOTELS])),
      });
      renderScreen();

      emit("resync", {});

      await waitFor(() => expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(1));
      await waitFor(() => expect(mock.callsTo("GET", FIRST_PAGE_URL)).toHaveLength(1));
    });

    it("says when live updates pause, then catches up once they are back", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const mock = mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(makeSpaceDetail()),
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([MORNING, HOTELS])),
      });
      renderScreen();
      act(() => FakeEventSource.latest.open());
      expect(screen.queryByText(OFFLINE_NOTICE)).not.toBeInTheDocument();

      act(() => FakeEventSource.latest.fail({ closed: true }));

      expect(screen.getByText(OFFLINE_NOTICE)).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_100);
      });
      expect(FakeEventSource.instances).toHaveLength(2);
      act(() => FakeEventSource.latest.open());

      await waitFor(() => expect(screen.queryByText(OFFLINE_NOTICE)).not.toBeInTheDocument());
      await waitFor(() => expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(1));
      await waitFor(() => expect(mock.callsTo("GET", FIRST_PAGE_URL)).toHaveLength(1));
    });

    it("sends a signed-out person to sign in when a live refresh is refused", async () => {
      mockFetch({
        [`GET ${FIRST_PAGE_URL}`]: errorResponse(401, "unauthenticated", "Sign in to continue."),
      });
      renderScreen();

      emit("item_added", { item_id: "item-3" });

      await waitFor(() =>
        expect(navigation.navigateTo).toHaveBeenCalledWith(
          "/auth/sign-in?next=%2Fspaces%2Fspace-1",
        ),
      );
      expect(titlesInFeed()).toEqual(["Morning flight", "Hotel shortlist"]);
    });

    it("lets the announcement go after a few seconds and restarts the clock on new activity", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let refreshes = 0;
      mockFetch({
        [`GET ${FIRST_PAGE_URL}`]: () => {
          refreshes += 1;
          const arrivals = Array.from({ length: refreshes }, (_, index) =>
            makeItem({
              id: `arrival-${index}`,
              title: `Arrival ${index}`,
              created_at: `2026-11-19T2${index}:00:00Z`,
            }),
          );
          return jsonResponse(makeItemsPage([...arrivals, MORNING, HOTELS]));
        },
      });
      renderScreen();

      emit("item_added");
      expect(await screen.findByText(ANNOUNCEMENT)).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      emit("item_added");
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(4));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(screen.getByText(ANNOUNCEMENT)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_100);
      });

      expect(screen.queryByText(ANNOUNCEMENT)).not.toBeInTheDocument();
    });
  });

  describe("the email switch in the members panel", () => {
    const MEMBERSHIP_URL = "/api/spaces/space-1/membership";

    it("shows the person's choice for this space, with the same label as in settings", () => {
      renderScreen({ initialSpace: makeSpaceDetail({ notify_email: false }) });

      const panel = screen.getByRole("region", { name: "Members" });
      expect(
        within(panel).getByRole("switch", { name: "Email me about this space" }),
      ).not.toBeChecked();
    });

    it("turns the switch off at once, saves it and keeps it off without refetching the space", async () => {
      const mock = mockFetch({
        [`PATCH ${MEMBERSHIP_URL}`]: jsonResponse({ notify_email: false }),
      });
      const { user } = renderScreen();

      await user.click(screen.getByRole("switch", { name: "Email me about this space" }));

      await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Email notifications off"));
      expect(screen.getByRole("switch", { name: "Email me about this space" })).not.toBeChecked();
      expect(mock.callsTo("PATCH", MEMBERSHIP_URL)[0]?.json).toEqual({ notify_email: false });
      expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(0);
    });

    it("puts the switch back when saving fails", async () => {
      mockFetch({
        [`PATCH ${MEMBERSHIP_URL}`]: errorResponse(500, "server_error", "We couldn't save that."),
      });
      const { user } = renderScreen();

      await user.click(screen.getByRole("switch", { name: "Email me about this space" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't save that.");
      expect(screen.getByRole("switch", { name: "Email me about this space" })).toBeChecked();
    });

    it("shows a pointer to Settings instead of the switch when emails are off for the account", () => {
      renderScreen({ me: makeMe({ email_frequency: "off" }) });

      expect(screen.queryByRole("switch", { name: "Email me about this space" })).toBeNull();
      expect(screen.getByRole("link", { name: "Change that in Settings" })).toHaveAttribute(
        "href",
        "/settings",
      );
    });
  });

  describe("retracting", () => {
    it("asks first, then removes the item for everyone", async () => {
      const mine = makeItem({ id: "mine", title: "My note", can_retract: true });
      const mock = mockFetch({ "DELETE /api/items/mine": emptyResponse() });
      const { user } = renderScreen({ initialFeed: makeItemsPage([mine, HOTELS]) });

      await user.click(screen.getByRole("button", { name: "Retract My note" }));
      const dialog = screen.getByRole("alertdialog", { name: "Retract “My note”?" });
      expect(callsOtherThanReading(mock)).toHaveLength(0);
      await user.click(within(dialog).getByRole("button", { name: "Retract" }));

      await waitFor(() =>
        expect(screen.queryByRole("article", { name: "My note" })).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(toasts.success).toHaveBeenCalledWith("Retracted");
      expect(titlesInFeed()).toEqual(["Hotel shortlist"]);
    });

    it("keeps the item when the person changes their mind", async () => {
      const mine = makeItem({ id: "mine", title: "My note", can_retract: true });
      const mock = mockFetch({});
      const { user } = renderScreen({ initialFeed: makeItemsPage([mine]) });
      await user.click(screen.getByRole("button", { name: "Retract My note" }));

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByRole("article", { name: "My note" })).toBeInTheDocument();
      expect(callsOtherThanReading(mock)).toHaveLength(0);
    });
  });

  describe("when the space is gone or unreachable", () => {
    it.each([
      [404, "not_found", "Space not found."],
      [403, "forbidden", "You are not a member of this space."],
    ])("shows the not available page after a %i", async (status, code, message) => {
      mockFetch({ [`GET ${SPACE_URL}`]: errorResponse(status, code, message) });
      renderScreen();

      emit("member_joined", {});

      expect(
        await screen.findByRole("heading", { name: "This space isn't available" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Back to your spaces" })).toHaveAttribute(
        "href",
        "/spaces",
      );
      expect(screen.queryByRole("textbox", { name: "Share something" })).not.toBeInTheDocument();
    });

    it("keeps showing what it has when a refresh fails for another reason", async () => {
      let attempts = 0;
      const mock = mockFetch({
        [`GET ${SPACE_URL}`]: () =>
          attempts++ === 0
            ? errorResponse(500, "server_error", "Something broke.")
            : jsonResponse(
                makeSpaceDetail({
                  memory: [makeFact(), makeFact({ key: "Budget", value: "$3,000" })],
                }),
              ),
      });
      renderScreen();

      emit("memory_set", { key: "Budget" });
      await waitFor(() => expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(1));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { level: 1, name: "Goa trip" })).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "This space isn't available" }),
      ).not.toBeInTheDocument();

      emit("memory_set", { key: "Budget" });
      expect(await screen.findByText("$3,000")).toBeInTheDocument();
    });
  });

  describe("combining", () => {
    it("shows the new plan and refreshes the feed without refetching the space", async () => {
      const plan = makePlan({
        id: "plan-2",
        content: "Merged plan text",
        created_at: "2026-11-19T12:00:00Z",
      });
      const mock = mockFetch({
        [`POST ${SPACE_URL}/combine`]: jsonResponse({ item: plan, created: true }),
        [`GET ${FIRST_PAGE_URL}`]: jsonResponse(makeItemsPage([plan, MORNING, HOTELS])),
      });
      const { user } = renderScreen();

      await user.click(screen.getByRole("button", { name: "Combine" }));

      await waitFor(() =>
        expect(screen.getByRole("region", { name: "Latest plan" })).toHaveTextContent(
          "Merged plan text",
        ),
      );
      await waitFor(() => expect(mock.callsTo("GET", FIRST_PAGE_URL)).toHaveLength(1));
      await waitFor(() => expect(titlesInFeed()).toEqual(["Morning flight", "Hotel shortlist"]));
      expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(0);
    });
  });

  describe("shared memory", () => {
    it("adds a fact in place without refetching the space", async () => {
      const mock = mockFetch({
        [`PUT ${SPACE_URL}/memory`]: jsonResponse({
          fact: makeFact({ key: "Budget", value: "$3,000" }),
          replaced_value: null,
          changed: true,
        }),
      });
      const { user } = renderScreen();

      await user.click(screen.getByRole("button", { name: "Add a fact" }));
      await user.type(screen.getByRole("textbox", { name: "Fact name" }), "Budget");
      await user.type(screen.getByRole("textbox", { name: "Fact value" }), "$3,000");
      await user.click(screen.getByRole("button", { name: "Save fact" }));

      const memory = screen.getByRole("region", { name: "Shared memory" });
      expect(await within(memory).findByText("$3,000")).toBeInTheDocument();
      expect(within(memory).getByText("Dec 20 to 23")).toBeInTheDocument();
      expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(0);
    });

    it("replaces the value when an existing fact is edited", async () => {
      mockFetch({
        [`PUT ${SPACE_URL}/memory`]: jsonResponse({
          fact: makeFact({ key: "Dates", value: "Dec 21 to 24" }),
          replaced_value: "Dec 20 to 23",
          changed: true,
        }),
      });
      const { user } = renderScreen();

      await user.click(screen.getByRole("button", { name: "Edit Dates" }));
      const value = screen.getByRole("textbox", { name: "Fact value" });
      await user.clear(value);
      await user.type(value, "Dec 21 to 24");
      await user.click(screen.getByRole("button", { name: "Save fact" }));

      const memory = screen.getByRole("region", { name: "Shared memory" });
      expect(await within(memory).findByText("Dec 21 to 24")).toBeInTheDocument();
      expect(within(memory).queryByText("Dec 20 to 23")).not.toBeInTheDocument();
      expect(within(memory).getAllByRole("listitem")).toHaveLength(1);
    });
  });

  describe("templates", () => {
    const VACATION_SPACE = makeSpaceDetail({
      template: FAMILY_VACATION,
      memory: [makeFact({ key: "Dates" })],
      unset_facts: [
        { key: "Budget", hint: "Total for the trip" },
        { key: "Destination", hint: "Where you are going" },
      ],
    });

    it("shows the template tips in a space with nothing in it yet", () => {
      renderScreen({
        initialSpace: makeSpaceDetail({ template: FAMILY_VACATION, memory: [] }),
        initialFeed: makeItemsPage([]),
      });

      const tips = screen.getByRole("region", { name: "Ideas to get started" });
      expect(
        within(tips)
          .getAllByRole("listitem")
          .map((tip) => tip.textContent),
      ).toEqual(["Share a hotel shortlist", "Set the budget", "Add the dates"]);
      expect(tips).toHaveTextContent("From the Trip template.");
    });

    it.each([
      [
        "a note in the feed",
        { initialSpace: makeSpaceDetail({ template: FAMILY_VACATION, memory: [] }) },
      ],
      [
        "a saved fact",
        {
          initialSpace: makeSpaceDetail({ template: FAMILY_VACATION }),
          initialFeed: makeItemsPage([]),
        },
      ],
      [
        "a plan",
        {
          initialSpace: makeSpaceDetail({
            template: FAMILY_VACATION,
            memory: [],
            latest_plan: makePlan(),
          }),
          initialFeed: makeItemsPage([]),
        },
      ],
    ])("hides the tips once there is %s", (_label, overrides) => {
      renderScreen(overrides);

      expect(
        screen.queryByRole("region", { name: "Ideas to get started" }),
      ).not.toBeInTheDocument();
    });

    it("shows no tips card when the template has none", () => {
      renderScreen({
        initialSpace: makeSpaceDetail({ template: makeTemplate({ tips: [] }), memory: [] }),
        initialFeed: makeItemsPage([]),
      });

      expect(
        screen.queryByRole("region", { name: "Ideas to get started" }),
      ).not.toBeInTheDocument();
    });

    it("lists the suggested facts in the shared memory with an Add action", () => {
      renderScreen({ initialSpace: VACATION_SPACE });

      const memory = screen.getByRole("region", { name: "Shared memory" });
      const suggested = within(memory).getByRole("list", { name: "Suggested facts" });
      expect(suggested).toHaveTextContent("Total for the trip");
      expect(within(memory).getByRole("button", { name: "Add Budget" })).toBeInTheDocument();
    });

    it("drops a suggestion once its fact is saved, without refetching the space", async () => {
      const mock = mockFetch({
        [`PUT ${SPACE_URL}/memory`]: jsonResponse({
          fact: makeFact({ key: "Budget", value: "$3,000" }),
          replaced_value: null,
          changed: true,
        }),
      });
      const { user } = renderScreen({ initialSpace: VACATION_SPACE });

      await user.click(screen.getByRole("button", { name: "Add Budget" }));
      await user.type(screen.getByRole("textbox", { name: "Fact value" }), "$3,000");
      await user.click(screen.getByRole("button", { name: "Save fact" }));

      const memory = screen.getByRole("region", { name: "Shared memory" });
      expect(await within(memory).findByText("$3,000")).toBeInTheDocument();
      const suggested = within(memory).getByRole("list", { name: "Suggested facts" });
      expect(within(suggested).queryByText("Budget")).not.toBeInTheDocument();
      expect(within(suggested).getByText("Destination")).toBeInTheDocument();
      expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(0);
    });

    it("shows the template sections as headings in the latest plan", () => {
      renderScreen({
        initialSpace: makeSpaceDetail({
          template: FAMILY_VACATION,
          latest_plan: makePlan({ content: "Where to stay\nSeaside Inn\n\nCosts\n- Flights" }),
        }),
      });

      const plan = screen.getByRole("region", { name: "Latest plan" });
      expect(
        within(plan)
          .getAllByRole("heading", { level: 3 })
          .map((heading) => heading.textContent),
      ).toEqual(["Where to stay", "Costs"]);
    });

    it("picks up a template someone else changed", async () => {
      const changed = makeTemplate({
        id: "trip",
        name: "Family trip",
        plan_sections: ["Packing", "To settle"],
      });
      mockFetch({
        [`GET ${SPACE_URL}`]: jsonResponse(
          makeSpaceDetail({
            template: changed,
            unset_facts: [{ key: "Passports", hint: "Who still needs one" }],
            latest_plan: makePlan({ content: "Packing\n- Sunscreen" }),
          }),
        ),
      });
      renderScreen({ initialSpace: VACATION_SPACE });

      emit("template_changed", {});

      expect(await screen.findByText("Passports")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add Budget" })).not.toBeInTheDocument();
      expect(
        within(screen.getByRole("region", { name: "Latest plan" })).getByRole("heading", {
          name: "Packing",
        }),
      ).toBeInTheDocument();
    });

    it("saves an edited template and refreshes what it shapes", async () => {
      const saved = makeTemplate({
        id: "trip",
        name: "Trip",
        facts: [{ key: "Passports", hint: "Who still needs one" }],
        plan_sections: ["Where to stay", "To settle"],
      });
      const mock = mockFetch({
        [`PUT ${SPACE_URL}/template`]: jsonResponse(saved),
        [`GET ${SPACE_URL}`]: jsonResponse(
          makeSpaceDetail({
            template: saved,
            unset_facts: [{ key: "Passports", hint: "Who still needs one" }],
          }),
        ),
      });
      const { user } = renderScreen({ initialSpace: VACATION_SPACE });

      await user.click(screen.getByRole("button", { name: "Space options" }));
      await user.click(screen.getByRole("menuitem", { name: "Edit template" }));
      const dialog = screen.getByRole("dialog", { name: "Edit template" });
      await user.click(within(dialog).getByRole("button", { name: "Remove fact 3" }));
      await user.click(within(dialog).getByRole("button", { name: "Remove fact 2" }));
      await user.click(within(dialog).getByRole("button", { name: "Remove fact 1" }));
      await user.click(within(dialog).getByRole("button", { name: "Add a suggested fact" }));
      await user.type(within(dialog).getByRole("textbox", { name: "Fact 1 name" }), "Passports");
      await user.type(
        within(dialog).getByRole("textbox", { name: "Fact 1 hint" }),
        "Who still needs one",
      );
      await user.click(within(dialog).getByRole("button", { name: "Save template" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const memory = screen.getByRole("region", { name: "Shared memory" });
      expect(within(memory).getByRole("button", { name: "Add Passports" })).toBeInTheDocument();
      expect(within(memory).queryByRole("button", { name: "Add Budget" })).not.toBeInTheDocument();
      await waitFor(() => expect(mock.callsTo("GET", SPACE_URL)).toHaveLength(1));
    });
  });

  describe("paging", () => {
    it("loads older items and then stops offering more", async () => {
      const older = makeItem({
        id: "item-0",
        title: "Older note",
        created_at: "2026-11-18T09:00:00Z",
      });
      mockFetch({
        "GET /api/spaces/space-1/items?limit=20&before=cursor-1": jsonResponse(
          makeItemsPage([older]),
        ),
      });
      const { user } = renderScreen({ initialFeed: makeItemsPage([MORNING, HOTELS], "cursor-1") });

      await user.click(screen.getByRole("button", { name: "Load more" }));

      expect(await screen.findByRole("article", { name: "Older note" })).toBeInTheDocument();
      expect(titlesInFeed()).toEqual(["Morning flight", "Hotel shortlist", "Older note"]);
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });

    it("shows a paging problem and lets people try again", async () => {
      mockFetch({
        "GET /api/spaces/space-1/items?limit=20&before=cursor-1": errorResponse(
          500,
          "server_error",
          "Could not load older items.",
        ),
      });
      const { user } = renderScreen({ initialFeed: makeItemsPage([MORNING], "cursor-1") });

      await user.click(screen.getByRole("button", { name: "Load more" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Could not load older items.");
      expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
      expect(titlesInFeed()).toEqual(["Morning flight"]);
    });
  });
});
