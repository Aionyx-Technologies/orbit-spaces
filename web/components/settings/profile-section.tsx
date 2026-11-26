"use client";

import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import { PhotoField } from "@/components/settings/photo-field";
import type { ProfileSectionProps } from "@/components/settings/profile-section.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, describeError } from "@/lib/api";
import type { Me, MeChanges } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { ABOUT_MAX, DISPLAY_NAME_MAX } from "@/lib/constants";

const LINE_BREAKS = /\s*[\r\n]+\s*/g;

export function ProfileSection({ me }: ProfileSectionProps) {
  const router = useRouter();
  const [saved, setSaved] = useState({ name: me.display_name, about: me.about });
  const [name, setName] = useState(me.display_name);
  const [about, setAbout] = useState(me.about);
  const [avatarUrl, setAvatarUrl] = useState(me.avatar_url);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameChanged = name.trim() !== saved.name;
  const aboutChanged = about.trim() !== saved.about;
  const canSave = name.trim() !== "" && (nameChanged || aboutChanged);

  function photoChanged(updated: Me) {
    setAvatarUrl(updated.avatar_url);
    router.refresh();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || pending) {
      return;
    }
    const changes: MeChanges = {};
    if (nameChanged) {
      changes.display_name = name;
    }
    if (aboutChanged) {
      changes.about = about;
    }
    setPending(true);
    setError(null);
    try {
      const updated = await api.me.update(changes);
      setSaved({ name: updated.display_name, about: updated.about });
      setName(updated.display_name);
      setAbout(updated.about);
      toast.success("Profile saved");
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
    <div className="flex flex-col gap-2.5">
      <Card aria-labelledby="profile-title" role="region">
        <CardHeader>
          <CardTitle id="profile-title">Profile</CardTitle>
          <CardDescription>This is how other people see you in a space.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <PhotoField name={saved.name} avatarUrl={avatarUrl} onChanged={photoChanged} />
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={DISPLAY_NAME_MAX}
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="about-me">About me</Label>
              <Textarea
                id="about-me"
                rows={2}
                value={about}
                onChange={(event) => setAbout(event.target.value.replace(LINE_BREAKS, " "))}
                maxLength={ABOUT_MAX}
                placeholder="A line about you, for the people you share spaces with."
                aria-describedby="about-count"
                className="min-h-0"
              />
              <p id="about-count" className="text-right text-sm text-muted-foreground">
                {about.length} of {ABOUT_MAX}
              </p>
            </div>
            <div className="grid gap-1">
              <span className="text-sm leading-none font-medium">Signed in as</span>
              <p className="text-base break-words text-muted-foreground">{me.email}</p>
            </div>
            <ErrorNotice message={error} />
            <Button type="submit" className="self-start" disabled={!canSave || pending}>
              {pending ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="px-1 text-sm text-muted-foreground">
        Your photo, name and about line are visible only to people in your spaces.
      </p>
    </div>
  );
}
