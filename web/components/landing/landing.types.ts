import type { DemoInfo } from "@/lib/api.types";

export type LandingProps = Readonly<{
  demo?: DemoInfo;
  mcpUrl?: string | null;
  billingEnabled?: boolean;
}>;
