"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import type {
  FrequencyChoice,
  NotificationsSectionProps,
} from "@/components/settings/notifications-section.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { api, describeError } from "@/lib/api";
import type { EmailFrequency, SpacesResponse } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { useSpaces } from "@/lib/queries";
import { timeZoneLabel } from "@/lib/time-zones";

function withNotify(
  current: SpacesResponse,
  spaceId: string,
  notifyEmail: boolean,
): SpacesResponse {
  return {
    spaces: current.spaces.map((space) =>
      space.id === spaceId ? { ...space, notify_email: notifyEmail } : space,
    ),
  };
}

function choicesFor(timeZone: string): readonly FrequencyChoice[] {
  return [
    {
      value: "instant",
      label: "As it happens",
      hint: "An email soon after something changes, at most one every 5 minutes per space.",
      saved: "Emails set to as it happens",
    },
    {
      value: "daily",
      label: "Daily summary",
      hint: `One email a day, at 8:00 in your time zone (${timeZoneLabel(timeZone)}), covering every space with changes.`,
      saved: "Emails set to a daily summary",
    },
    {
      value: "off",
      label: "Off",
      hint: "No emails about activity in your spaces.",
      saved: "Activity emails turned off",
    },
  ];
}

export function NotificationsSection({ initial, frequency, timeZone }: NotificationsSectionProps) {
  const { data, mutate } = useSpaces(initial);
  const spaces = (data ?? initial).spaces;
  const [choice, setChoice] = useState<EmailFrequency>(frequency);
  const [error, setError] = useState<string | null>(null);
  const groupId = useId();
  const choices = choicesFor(timeZone);

  async function choose(next: EmailFrequency) {
    const before = choice;
    setChoice(next);
    setError(null);
    try {
      await api.me.update({ email_frequency: next });
      toast.success(choices.find((option) => option.value === next)?.saved ?? "Saved");
    } catch (failure) {
      setChoice(before);
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    }
  }

  async function toggle(spaceId: string, notifyEmail: boolean) {
    setError(null);
    try {
      await mutate(
        async (current) => {
          await api.spaces.setNotify(spaceId, notifyEmail);
          return withNotify(current ?? initial, spaceId, notifyEmail);
        },
        {
          optimisticData: (current) => withNotify(current ?? initial, spaceId, notifyEmail),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      );
      toast.success(notifyEmail ? "Email notifications on" : "Email notifications off");
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    }
  }

  return (
    <Card aria-labelledby="notifications-title" role="region">
      <CardHeader>
        <CardTitle id="notifications-title">Email notifications</CardTitle>
        <CardDescription>
          Get an email when something changes in a space, even when no chat or tab is open.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <RadioGroup
          aria-label="How often to email you"
          value={choice}
          onValueChange={(value) => {
            const picked = choices.find((option) => option.value === value);
            if (picked) {
              void choose(picked.value);
            }
          }}
        >
          {choices.map((option) => (
            <div key={option.value} className="flex items-start gap-3 rounded-md border p-3.5">
              <RadioGroupItem value={option.value} id={`${groupId}-${option.value}`} />
              <Label
                htmlFor={`${groupId}-${option.value}`}
                className="flex min-w-0 flex-1 flex-col gap-1 leading-snug"
              >
                <span className="text-base">{option.label}</span>
                <span className="text-sm font-normal text-muted-foreground">{option.hint}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {choice === "off" ? null : (
          <div className="flex flex-col gap-3">
            <h3 className="text-eyebrow text-muted-foreground">Spaces</h3>
            {spaces.length === 0 ? (
              <p className="text-base text-muted-foreground">
                Switches appear here once you are in a space.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {spaces.map((space) => (
                  <li
                    key={space.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <Label htmlFor={`notify-${space.id}`} className="min-w-0 text-base">
                      <span className="block truncate">{space.name}</span>
                    </Label>
                    <Switch
                      id={`notify-${space.id}`}
                      checked={space.notify_email}
                      onCheckedChange={(checked) => void toggle(space.id, checked)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <ErrorNotice message={error} />
        <p className="text-sm text-muted-foreground">
          Sign-in links and invitations are always sent.
        </p>
      </CardContent>
    </Card>
  );
}
