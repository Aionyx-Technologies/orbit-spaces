import type { EmailFrequency } from "@/lib/api.types";

export type SpaceEmailSwitchProps = Readonly<{
  spaceId: string;
  notifyEmail: boolean;
  frequency: EmailFrequency;
  onChanged: (notifyEmail: boolean) => void;
}>;
