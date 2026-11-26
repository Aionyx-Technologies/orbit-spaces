import { serverRequest } from "@/lib/server-api";

export async function readBillingEnabled(): Promise<boolean> {
  try {
    const result = await serverRequest<{ enabled: boolean }>("/api/billing/public");
    return result.ok && result.data.enabled === true;
  } catch {
    return false;
  }
}
