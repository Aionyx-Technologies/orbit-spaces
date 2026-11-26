import type { Me } from "@/lib/api.types";
import type { CropView } from "@/lib/avatar-crop.types";
import type { LoadedPhoto } from "@/lib/avatar-file.types";

export type PhotoCropDialogProps = Readonly<{
  file: File;
  onClose: () => void;
  onSaved: (me: Me) => void;
}>;

export type PhotoCropStageProps = Readonly<{
  photo: LoadedPhoto | null;
  view: CropView | null;
  emptyText: string;
  onMove: (sidewaysShare: number, downwardShare: number) => void;
  onZoomBy: (change: number) => void;
}>;
