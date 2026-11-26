"use client";

import { useEffect, useState } from "react";

import { ErrorNotice } from "@/components/common/error-notice";
import type { PhotoCropDialogProps } from "@/components/settings/photo-crop-dialog.types";
import { PhotoCropStage } from "@/components/settings/photo-crop-stage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { redirectIfUnauthenticated } from "@/lib/auth-redirect";
import { cropRegion, MAX_ZOOM, MIN_ZOOM, panView, startingView, zoomView } from "@/lib/avatar-crop";
import type { CropView } from "@/lib/avatar-crop.types";
import { cropPhoto, describePhotoFailure, loadPhoto, UNREADABLE_MESSAGE } from "@/lib/avatar-file";
import type { LoadedPhoto } from "@/lib/avatar-file.types";

export function PhotoCropDialog({ file, onClose, onSaved }: PhotoCropDialogProps) {
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [view, setView] = useState<CropView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    loadPhoto(file).then(
      (loaded) => {
        if (current) {
          setPhoto(loaded);
          setView(startingView(loaded.size));
        }
      },
      () => {
        if (current) {
          setError(UNREADABLE_MESSAGE);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [file]);

  function move(sidewaysShare: number, downwardShare: number) {
    setView((current) =>
      photo && current ? panView(photo.size, current, sidewaysShare, downwardShare) : current,
    );
  }

  function zoomTo(zoom: number) {
    setView((current) => (photo && current ? zoomView(photo.size, current, zoom) : current));
  }

  async function save() {
    if (!photo || !view || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cropped = await cropPhoto(photo, cropRegion(photo.size, view));
      onSaved(await api.me.uploadAvatar(cropped.blob, cropped.filename));
    } catch (failure) {
      if (!redirectIfUnauthenticated(failure)) {
        setError(describePhotoFailure(failure));
      }
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) {
          onClose();
        }
      }}
    >
      <DialogContent showClose={!saving}>
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>
            Drag the picture, or use the arrow keys, to choose what shows. Orbit shows it as a
            circle.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <PhotoCropStage
            photo={photo}
            view={view}
            emptyText={error ? "No preview" : "Loading photo…"}
            onMove={move}
            onZoomBy={(change) => zoomTo((view?.zoom ?? MIN_ZOOM) + change)}
          />
          <div className="grid gap-2">
            <Label htmlFor="photo-zoom">Zoom</Label>
            <input
              id="photo-zoom"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={view?.zoom ?? MIN_ZOOM}
              disabled={!photo}
              onChange={(event) => zoomTo(Number(event.target.value))}
              className="h-6 w-full accent-primary disabled:opacity-50"
            />
          </div>
        </div>
        <ErrorNotice message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!photo || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
