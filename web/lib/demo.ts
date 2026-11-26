import type { DemoInfo } from "@/lib/api.types";
import { serverRequest } from "@/lib/server-api";

export const DEMO_OFF: DemoInfo = { enabled: false, people: [] };

export async function readDemo(): Promise<DemoInfo> {
  try {
    const result = await serverRequest<DemoInfo>("/api/demo");
    return result.ok && result.data.enabled ? result.data : DEMO_OFF;
  } catch {
    return DEMO_OFF;
  }
}
