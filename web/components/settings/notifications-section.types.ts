import type { EmailFrequency, SpacesResponse } from "@/lib/api.types";

export type NotificationsSectionProps = Readonly<{
  initial: SpacesResponse;
  frequency: EmailFrequency;
  timeZone: string;
}>;

export type FrequencyChoice = Readonly<{
  value: EmailFrequency;
  label: string;
  hint: string;
  saved: string;
}>;
