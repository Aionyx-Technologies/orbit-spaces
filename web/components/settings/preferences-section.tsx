"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type SubmitEvent } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import type { PreferencesSectionProps } from "@/components/settings/preferences-section.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, describeError } from "@/lib/api";
import type { MeChanges } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { ASK_EACH_TIME } from "@/lib/constants";
import { useSpaces } from "@/lib/queries";
import {
  browserTimeZone,
  knownTimeZones,
  serverTimeZones,
  timeZoneLabel,
  zoneOptions,
  zoneToSuggest,
} from "@/lib/time-zones";

function subscribeToNothing(): () => void {
  return () => undefined;
}

function useBrowserValue<T>(read: () => T, onServer: () => T): T {
  return useSyncExternalStore(subscribeToNothing, read, onServer);
}

export function PreferencesSection({ me, initialSpaces }: PreferencesSectionProps) {
  const router = useRouter();
  const { data } = useSpaces(initialSpaces);
  const spaces = (data ?? initialSpaces).spaces;
  const browserZone = useBrowserValue(browserTimeZone, () => null);
  const knownZones = useBrowserValue(knownTimeZones, serverTimeZones);
  const [saved, setSaved] = useState({
    timeZone: me.time_zone,
    defaultSpace: me.default_space_id ?? ASK_EACH_TIME,
  });
  const [pickedZone, setPickedZone] = useState<string | null>(null);
  const [pickedSpace, setPickedSpace] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestion = zoneToSuggest(saved.timeZone, browserZone);
  const zone = pickedZone ?? suggestion ?? saved.timeZone;
  const savedSpaceListed = spaces.some((space) => space.id === saved.defaultSpace);
  const savedSpace = savedSpaceListed ? saved.defaultSpace : ASK_EACH_TIME;
  const space = pickedSpace ?? savedSpace;
  const zoneChanged = zone !== saved.timeZone;
  const spaceChanged = space !== savedSpace;
  const filledFromBrowser = pickedZone === null && suggestion !== null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!zoneChanged && !spaceChanged) || pending) {
      return;
    }
    const changes: MeChanges = {};
    if (zoneChanged) {
      changes.time_zone = zone;
    }
    if (spaceChanged) {
      changes.default_space_id = space === ASK_EACH_TIME ? null : space;
    }
    setPending(true);
    setError(null);
    try {
      const updated = await api.me.update(changes);
      setSaved({
        timeZone: updated.time_zone,
        defaultSpace: updated.default_space_id ?? ASK_EACH_TIME,
      });
      setPickedZone(null);
      setPickedSpace(null);
      toast.success("Preferences saved");
      router.refresh();
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card aria-labelledby="preferences-title" role="region">
      <CardHeader>
        <CardTitle id="preferences-title">Preferences</CardTitle>
        <CardDescription>
          How Orbit tells time for you, and where it shares by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="time-zone">Time zone</Label>
            <Select
              id="time-zone"
              value={zone}
              onChange={(event) => setPickedZone(event.target.value)}
              aria-describedby="time-zone-hint"
            >
              {zoneOptions(knownZones, zone).map((option) => (
                <option key={option} value={option}>
                  {timeZoneLabel(option)}
                </option>
              ))}
            </Select>
            <p id="time-zone-hint" className="text-sm text-muted-foreground">
              {filledFromBrowser ? "Filled in from your browser. Save to keep it. " : null}
              Used for the daily summary and for dates in emails.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="default-space">Default space</Label>
            <Select
              id="default-space"
              value={space}
              onChange={(event) => setPickedSpace(event.target.value)}
              aria-describedby="default-space-hint"
            >
              <option value={ASK_EACH_TIME}>Ask me each time</option>
              {spaces.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
            <p id="default-space-hint" className="text-sm text-muted-foreground">
              Used when you ask an assistant to share without naming a space.
            </p>
          </div>
          <ErrorNotice message={error} />
          <Button
            type="submit"
            className="self-start"
            disabled={(!zoneChanged && !spaceChanged) || pending}
          >
            {pending ? "Saving…" : "Save preferences"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
