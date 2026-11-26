"use client";

import { Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/common/error-notice";
import { PersonAvatar } from "@/components/common/person-avatar";
import { PhotoCropDialog } from "@/components/settings/photo-crop-dialog";
import type { PhotoFieldProps } from "@/components/settings/photo-field.types";
import { Button } from "@/components/ui/button";
import { api, describeError } from "@/lib/api";
import type { Me } from "@/lib/api.types";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { checkPhotoFile } from "@/lib/avatar-file";
import { AVATAR_TYPES } from "@/lib/constants";

export function PhotoField({ name, avatarUrl, onChanged }: PhotoFieldProps) {
  const picker = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const problem = checkPhotoFile(file);
    setError(problem);
    setChosen(problem === null ? file : null);
  }

  function saved(me: Me) {
    setChosen(null);
    onChanged(me);
    toast.success("Photo saved");
  }

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      onChanged(await api.me.removeAvatar());
      toast.success("Photo removed");
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describeError(failure));
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <PersonAvatar
          name={name}
          src={avatarUrl}
          size="xl"
          label={avatarUrl ? "Your profile photo" : "No profile photo yet"}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()}>
            <UploadIcon aria-hidden="true" />
            {avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {avatarUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={removing}
              onClick={() => void remove()}
            >
              <Trash2Icon aria-hidden="true" />
              {removing ? "Removing…" : "Remove photo"}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">JPEG, PNG or WebP, up to 5 MB.</p>
      <ErrorNotice message={error} />
      <input
        ref={picker}
        type="file"
        hidden
        accept={AVATAR_TYPES.join(",")}
        aria-label="Choose a photo"
        onChange={picked}
      />
      {chosen ? (
        <PhotoCropDialog file={chosen} onClose={() => setChosen(null)} onSaved={saved} />
      ) : null}
    </div>
  );
}
