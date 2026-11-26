import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ApiError, GENERIC_MESSAGE, signInUrl } from "@/lib/api";
import type { ApiErrorBody } from "@/lib/api.types";
import type { ServerResult } from "@/lib/server-api.types";

const DEFAULT_API_URL = "http://localhost:8000";

export function apiBaseUrl(): string {
  const configured = process.env.ORBIT_API_URL?.trim() || DEFAULT_API_URL;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

async function readError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error && typeof body.error.code === "string") {
      return { code: body.error.code, message: String(body.error.message ?? GENERIC_MESSAGE) };
    }
  } catch {
    return { code: "error", message: GENERIC_MESSAGE };
  }
  return { code: "error", message: GENERIC_MESSAGE };
}

export async function serverRequest<T>(path: string): Promise<ServerResult<T>> {
  const cookieHeader = (await cookies()).toString();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Orbit can't be reached right now.");
  }
  if (!response.ok) {
    const error = await readError(response);
    return { ok: false, status: response.status, ...error };
  }
  return { ok: true, data: (await response.json()) as T };
}

export async function serverGet<T>(path: string, returnTo: string): Promise<T> {
  const result = await serverRequest<T>(path);
  if (result.ok) {
    return result.data;
  }
  if (result.status === 401) {
    redirect(signInUrl(returnTo));
  }
  if (result.status === 403 || result.status === 404) {
    notFound();
  }
  throw new ApiError(result.status, result.code, result.message);
}

export async function serverGetOrDefault<T>(
  path: string,
  returnTo: string,
  fallback: T,
): Promise<T> {
  const result = await serverRequest<T>(path);
  if (result.ok) {
    return result.data;
  }
  if (result.status === 404) {
    return fallback;
  }
  if (result.status === 401) {
    redirect(signInUrl(returnTo));
  }
  throw new ApiError(result.status, result.code, result.message);
}

export async function serverGetOptional<T>(path: string): Promise<T | null> {
  const result = await serverRequest<T>(path);
  if (result.ok) {
    return result.data;
  }
  if (result.status === 401) {
    return null;
  }
  throw new ApiError(result.status, result.code, result.message);
}
