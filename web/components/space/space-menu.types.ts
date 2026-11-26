import type { Template } from "@/lib/api.types";

export type SpaceMenuProps = Readonly<{
  spaceId: string;
  spaceName: string;
  isCreator: boolean;
  template: Template;
  onTemplateSaved: (template: Template) => void;
}>;
