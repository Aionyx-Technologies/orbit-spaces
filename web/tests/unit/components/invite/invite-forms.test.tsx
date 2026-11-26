import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InviteSignInForm } from "@/components/invite/invite-sign-in-form";
import { WaitlistForm } from "@/components/invite/waitlist-form";
import { NETWORK_MESSAGE } from "@/lib/api";
import { errorResponse, failFetch, jsonResponse, mockFetch } from "@/tests/unit/helpers/mock-fetch";
import { renderPlain } from "@/tests/unit/helpers/render";

describe("WaitlistForm", () => {
  it("explains that Orbit is in private testing and asks for an email", () => {
    renderPlain(<WaitlistForm initialEmail="" />);

    expect(
      screen.getByRole("heading", { name: "Orbit is in a small orbit for now" }),
    ).toBeInTheDocument();
    const email = screen.getByRole("textbox", { name: "Email" });
    expect(email).toBeRequired();
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(screen.getByRole("button", { name: "Join the waitlist" })).toBeEnabled();
  });

  it("starts with the email the person already gave", () => {
    renderPlain(<WaitlistForm initialEmail="blake@example.com" />);

    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("blake@example.com");
  });

  it("joins the list and confirms with the address", async () => {
    const mock = mockFetch({ "POST /auth/waitlist": jsonResponse({ status: "joined" }) });
    const { user } = renderPlain(<WaitlistForm initialEmail="" />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "blake@example.com");
    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent("You are on the list");
    expect(confirmation).toHaveTextContent(
      "We will email blake@example.com as soon as a space opens up for you.",
    );
    const call = mock.callsTo("POST", "/auth/waitlist")[0];
    expect(call?.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(new URLSearchParams(call?.body ?? "").get("email")).toBe("blake@example.com");
    expect(screen.queryByRole("textbox", { name: "Email" })).not.toBeInTheDocument();
  });

  it("shows the server's message and keeps the form when joining fails", async () => {
    mockFetch({
      "POST /auth/waitlist": errorResponse(
        429,
        "rate_limited",
        "Too many requests. Try again in a minute.",
      ),
    });
    const { user } = renderPlain(<WaitlistForm initialEmail="blake@example.com" />);

    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Try again in a minute.",
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("blake@example.com");
    expect(screen.getByRole("button", { name: "Join the waitlist" })).toBeEnabled();
  });

  it("explains a network failure in plain words", async () => {
    failFetch();
    const { user } = renderPlain(<WaitlistForm initialEmail="blake@example.com" />);

    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK_MESSAGE);
  });

  it("shows progress and joins only once while waiting", async () => {
    const gate = Promise.withResolvers<Response>();
    const mock = mockFetch({ "POST /auth/waitlist": () => gate.promise });
    const { user } = renderPlain(<WaitlistForm initialEmail="blake@example.com" />);

    await user.click(screen.getByRole("button", { name: "Join the waitlist" }));

    expect(await screen.findByRole("button", { name: "Joining…" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Email" }), "{Enter}");
    gate.resolve(jsonResponse({ status: "joined" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(mock.callsTo("POST", "/auth/waitlist")).toHaveLength(1);
  });
});

describe("InviteSignInForm", () => {
  it("asks for an email and promises no password", () => {
    renderPlain(<InviteSignInForm token="abc123" />);

    const email = screen.getByRole("textbox", { name: "Email" });
    expect(email).toBeRequired();
    expect(email).toHaveAccessibleDescription(
      "We email you a link. No password and nothing to install.",
    );
    expect(screen.getByRole("button", { name: "Email me a link" })).toBeEnabled();
  });

  it("asks for the link to be sent, then tells the person to check their email", async () => {
    const mock = mockFetch({ "POST /auth/sign-in": jsonResponse({ status: "sent" }) });
    const { user } = renderPlain(<InviteSignInForm token="abc123" />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "blake@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a link" }));

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent("Check your email");
    expect(confirmation).toHaveTextContent("We sent a sign-in link to blake@example.com.");
    expect(confirmation).toHaveTextContent("Open it in this browser");
    const body = new URLSearchParams(mock.callsTo("POST", "/auth/sign-in")[0]?.body ?? "");
    expect(body.get("email")).toBe("blake@example.com");
    expect(body.get("next")).toBe("/invite/abc123");
    expect(body.get("invite")).toBe("abc123");
  });

  it("encodes an unusual token in the address to come back to", async () => {
    const mock = mockFetch({ "POST /auth/sign-in": jsonResponse({ status: "sent" }) });
    const { user } = renderPlain(<InviteSignInForm token="a/b" />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "blake@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a link" }));

    await screen.findByRole("status");
    const body = new URLSearchParams(mock.callsTo("POST", "/auth/sign-in")[0]?.body ?? "");
    expect(body.get("next")).toBe("/invite/a%2Fb");
    expect(body.get("invite")).toBe("a/b");
  });

  it("lets the person go back and use a different email", async () => {
    mockFetch({ "POST /auth/sign-in": jsonResponse({ status: "sent" }) });
    const { user } = renderPlain(<InviteSignInForm token="abc123" />);
    await user.type(screen.getByRole("textbox", { name: "Email" }), "blake@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a link" }));
    await screen.findByRole("status");

    await user.click(screen.getByRole("button", { name: "Use a different email" }));

    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("blake@example.com");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("moves to the waitlist, with the email filled in, while Orbit is private", async () => {
    mockFetch({ "POST /auth/sign-in": jsonResponse({ status: "private_testing" }) });
    const { user } = renderPlain(<InviteSignInForm token="abc123" />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "blake@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(
      await screen.findByRole("heading", { name: "Orbit is in a small orbit for now" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("blake@example.com");
    expect(screen.getByRole("button", { name: "Join the waitlist" })).toBeInTheDocument();
  });

  it("shows the server's message and keeps the form on failure", async () => {
    mockFetch({
      "POST /auth/sign-in": errorResponse(
        429,
        "rate_limited",
        "Too many sign-in attempts. Try again later.",
      ),
    });
    const { user } = renderPlain(<InviteSignInForm token="abc123" />);
    await user.type(screen.getByRole("textbox", { name: "Email" }), "blake@example.com");

    await user.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many sign-in attempts. Try again later.",
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("blake@example.com");
    expect(screen.getByRole("button", { name: "Email me a link" })).toBeEnabled();
  });

  it("shows progress and sends only one link while waiting", async () => {
    const gate = Promise.withResolvers<Response>();
    const mock = mockFetch({ "POST /auth/sign-in": () => gate.promise });
    const { user } = renderPlain(<InviteSignInForm token="abc123" />);
    await user.type(screen.getByRole("textbox", { name: "Email" }), "blake@example.com");

    await user.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    await user.keyboard("{Enter}");
    gate.resolve(jsonResponse({ status: "sent" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(mock.callsTo("POST", "/auth/sign-in")).toHaveLength(1);
  });
});
