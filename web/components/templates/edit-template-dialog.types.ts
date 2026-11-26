import type { Template } from "@/lib/api.types";

export type EditTemplateDialogProps = Readonly<{
  spaceId: string;
  template: Template;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (template: Template) => void;
}>;

export type EditTemplateFormProps = Readonly<{
  spaceId: string;
  template: Template;
  onClose: () => void;
  onSaved: (template: Template) => void;
}>;
