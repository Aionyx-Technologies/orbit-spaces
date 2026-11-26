import type { SpaceDetail, Template } from "@/lib/api.types";
import type { ConnectionStatus } from "@/lib/use-space-events.types";

export type SpaceHeaderProps = Readonly<{
  space: Pick<SpaceDetail, "id" | "name" | "members" | "is_creator" | "created_at" | "template">;
  status: ConnectionStatus;
  onTemplateSaved: (template: Template) => void;
}>;
