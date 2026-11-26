import type {
  AcceptResult,
  ApiErrorBody,
  Billing,
  BillingProduct,
  CombineResult,
  ConnectionsResponse,
  CreateSpaceFact,
  FactInput,
  FactRenameInput,
  FactResult,
  HttpMethod,
  InvitationsResponse,
  InviteCreated,
  InviteView,
  ItemsPage,
  Item,
  Me,
  MeChanges,
  Membership,
  PageQuery,
  RequestInitOptions,
  ShareInput,
  SignInInput,
  SignInResult,
  SignOutResult,
  SpaceDetail,
  SpaceSuggestion,
  SpaceSummary,
  SpaceTemplateChoice,
  SpacesResponse,
  Template,
  TemplateDraft,
  TemplateInput,
  TemplatesResponse,
  WaitlistResult,
} from "@/lib/api.types";
import { SIGN_IN_PATH } from "@/lib/constants";

export const NETWORK_MESSAGE =
  "Orbit can't be reached right now. Check your connection and try again.";
export const GENERIC_MESSAGE = "Something went wrong. Please try again.";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function readErrorBody(response: Response): Promise<ApiErrorBody["error"] | null> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    const error = body.error;
    if (error && typeof error.code === "string" && typeof error.message === "string") {
      return { code: error.code, message: error.message };
    }
    return null;
  } catch {
    return null;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await readErrorBody(response);
  return new ApiError(response.status, body?.code ?? "error", body?.message ?? GENERIC_MESSAGE);
}

async function send(
  method: HttpMethod,
  path: string,
  options: RequestInitOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(options.form);
  } else if (options.multipart) {
    body = options.multipart;
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", NETWORK_MESSAGE);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response;
}

export async function requestJson<T>(
  method: HttpMethod,
  path: string,
  options?: RequestInitOptions,
): Promise<T> {
  const response = await send(method, path, options);
  return (await response.json()) as T;
}

export async function requestVoid(
  method: HttpMethod,
  path: string,
  options?: RequestInitOptions,
): Promise<void> {
  await send(method, path, options);
}

export function fetcher<T>(path: string): Promise<T> {
  return requestJson<T>("GET", path);
}

export function signInUrl(next: string): string {
  return `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function describeError(error: unknown, fallback: string = GENERIC_MESSAGE): string {
  return error instanceof ApiError ? error.message : fallback;
}

function itemsPath(spaceId: string, query: PageQuery): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.before) {
    params.set("before", query.before);
  }
  const suffix = params.toString();
  return `/api/spaces/${encodeURIComponent(spaceId)}/items${suffix ? `?${suffix}` : ""}`;
}

export const itemsKey = itemsPath;

function spacePath(spaceId: string): string {
  return `/api/spaces/${encodeURIComponent(spaceId)}`;
}

export const spaceKey = spacePath;

export function factHistoryKey(spaceId: string, key?: string): string {
  const query = key === undefined ? "" : `?key=${encodeURIComponent(key)}`;
  return `${spacePath(spaceId)}/memory/history${query}`;
}

export const SPACES_KEY = "/api/spaces";
export const INVITATIONS_KEY = "/api/invitations";
export const TEMPLATES_KEY = "/api/templates";
export const ME_KEY = "/api/me";
export const BILLING_KEY = "/api/billing";
const AVATAR_PATH = "/api/me/avatar";

function invitationPath(invitationId: string): string {
  return `${INVITATIONS_KEY}/${encodeURIComponent(invitationId)}`;
}

export const api = {
  me: {
    get: () => requestJson<Me>("GET", ME_KEY),
    update: (changes: MeChanges) => requestJson<Me>("PATCH", ME_KEY, { json: changes }),
    uploadAvatar: (photo: Blob, filename: string) => {
      const form = new FormData();
      form.append("file", photo, filename);
      return requestJson<Me>("POST", AVATAR_PATH, { multipart: form });
    },
    removeAvatar: () => requestJson<Me>("DELETE", AVATAR_PATH),
    signOutEverywhere: () => requestVoid("POST", "/api/me/sessions/revoke-all"),
    remove: () => requestVoid("DELETE", ME_KEY),
  },
  billing: {
    get: () => requestJson<Billing>("GET", BILLING_KEY),
    checkout: (product: BillingProduct, returnTo?: string) =>
      requestJson<{ url: string }>("POST", `${BILLING_KEY}/checkout`, {
        json: returnTo === undefined ? { product } : { product, return_to: returnTo },
      }),
    portal: (returnTo?: string) =>
      requestJson<{ url: string }>("POST", `${BILLING_KEY}/portal`, {
        json: returnTo === undefined ? undefined : { return_to: returnTo },
      }),
  },
  spaces: {
    list: () => requestJson<SpacesResponse>("GET", "/api/spaces"),
    create: (name: string, template?: SpaceTemplateChoice, facts?: CreateSpaceFact[]) =>
      requestJson<SpaceSummary>("POST", "/api/spaces", {
        json: { name, ...template, ...(facts && facts.length > 0 ? { facts } : {}) },
      }),
    suggest: (purpose: string) =>
      requestJson<SpaceSuggestion>("POST", "/api/spaces/suggest", { json: { purpose } }),
    get: (spaceId: string) => requestJson<SpaceDetail>("GET", spacePath(spaceId)),
    setTemplate: (spaceId: string, template: TemplateInput) =>
      requestJson<Template>("PUT", `${spacePath(spaceId)}/template`, { json: template }),
    remove: (spaceId: string) => requestVoid("DELETE", spacePath(spaceId)),
    markRead: (spaceId: string) => requestVoid("POST", `${spacePath(spaceId)}/read`),
    setNotify: (spaceId: string, notifyEmail: boolean) =>
      requestJson<Membership>("PATCH", `${spacePath(spaceId)}/membership`, {
        json: { notify_email: notifyEmail },
      }),
  },
  templates: {
    list: () => requestJson<TemplatesResponse>("GET", TEMPLATES_KEY),
    draft: (purpose: string) =>
      requestJson<TemplateDraft>("POST", `${TEMPLATES_KEY}/draft`, { json: { purpose } }),
  },
  items: {
    list: (spaceId: string, query: PageQuery = {}) =>
      requestJson<ItemsPage>("GET", itemsPath(spaceId, query)),
    share: (spaceId: string, input: ShareInput) =>
      requestJson<Item>("POST", `${spacePath(spaceId)}/items`, { json: input }),
    retract: (itemId: string) => requestVoid("DELETE", `/api/items/${encodeURIComponent(itemId)}`),
  },
  memory: {
    set: (spaceId: string, input: FactInput) =>
      requestJson<FactResult>("PUT", `${spacePath(spaceId)}/memory`, { json: input }),
    rename: (spaceId: string, input: FactRenameInput) =>
      requestJson<FactResult>("POST", `${spacePath(spaceId)}/memory/rename`, { json: input }),
    remove: (spaceId: string, key: string) =>
      requestVoid("DELETE", `${spacePath(spaceId)}/memory?key=${encodeURIComponent(key)}`),
  },
  combine: {
    run: (spaceId: string, instruction?: string) =>
      requestJson<CombineResult>("POST", `${spacePath(spaceId)}/combine`, {
        json: { instruction: instruction ?? null },
      }),
  },
  invites: {
    create: (spaceId: string, email: string) =>
      requestJson<InviteCreated>("POST", `${spacePath(spaceId)}/invites`, {
        json: { email: email.trim() === "" ? null : email.trim() },
      }),
    resend: (spaceId: string, inviteId: string) =>
      requestJson<InviteCreated>(
        "POST",
        `${spacePath(spaceId)}/invites/${encodeURIComponent(inviteId)}/resend`,
      ),
    cancel: (spaceId: string, inviteId: string) =>
      requestVoid("DELETE", `${spacePath(spaceId)}/invites/${encodeURIComponent(inviteId)}`),
    view: (token: string) =>
      requestJson<InviteView>("GET", `/api/invites/${encodeURIComponent(token)}`),
    accept: (token: string) =>
      requestJson<AcceptResult>("POST", `/api/invites/${encodeURIComponent(token)}/accept`),
  },
  invitations: {
    list: () => requestJson<InvitationsResponse>("GET", INVITATIONS_KEY),
    accept: (invitationId: string) =>
      requestJson<AcceptResult>("POST", `${invitationPath(invitationId)}/accept`),
    decline: (invitationId: string) =>
      requestVoid("POST", `${invitationPath(invitationId)}/decline`),
  },
  connections: {
    list: () => requestJson<ConnectionsResponse>("GET", "/api/connections"),
    revoke: (connectionId: string) =>
      requestVoid("DELETE", `/api/connections/${encodeURIComponent(connectionId)}`),
  },
  auth: {
    signIn: (input: SignInInput) =>
      requestJson<SignInResult>("POST", "/auth/sign-in", { form: { ...input } }),
    waitlist: (email: string) =>
      requestJson<WaitlistResult>("POST", "/auth/waitlist", { form: { email } }),
    signOut: (next?: string) =>
      requestJson<SignOutResult>("POST", "/auth/sign-out", { form: next ? { next } : {} }),
  },
};
