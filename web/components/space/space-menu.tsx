"use client";

import { DownloadIcon, EllipsisIcon, LayoutTemplateIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { DeleteSpaceDialog } from "@/components/space/delete-space-dialog";
import type { SpaceMenuProps } from "@/components/space/space-menu.types";
import { EditTemplateDialog } from "@/components/templates/edit-template-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SpaceMenu({
  spaceId,
  spaceName,
  isCreator,
  template,
  onTemplateSaved,
}: SpaceMenuProps) {
  const [deleting, setDeleting] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Space options">
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setEditingTemplate(true)}>
            <LayoutTemplateIcon aria-hidden="true" />
            Edit template
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/spaces/${encodeURIComponent(spaceId)}/export`} download>
              <DownloadIcon aria-hidden="true" />
              Export as JSON
            </a>
          </DropdownMenuItem>
          {isCreator ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2Icon aria-hidden="true" />
                Delete space
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <EditTemplateDialog
        spaceId={spaceId}
        template={template}
        open={editingTemplate}
        onOpenChange={setEditingTemplate}
        onSaved={onTemplateSaved}
      />
      <DeleteSpaceDialog
        spaceId={spaceId}
        spaceName={spaceName}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </>
  );
}
