"use client";

import { CopyIcon, DownloadIcon, Share2Icon, SendIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { ShareItemMenuProps } from "@/components/space/share-item-menu.types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyText } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/download";
import { itemFileName, itemMarkdown } from "@/lib/item-file";

/*
 * Share one item or plan outside Orbit: through the device's own share sheet
 * where the browser has one, as copied text, or as a Markdown file.
 */
export function ShareItemMenu({ title, content }: ShareItemMenuProps) {
  const [canShare, setCanShare] = useState(false);

  const markdown = itemMarkdown(title, content);

  async function shareNative() {
    try {
      await navigator.share({ title, text: markdown });
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError")) {
        toast.error("Could not open sharing. Copy the text instead.");
      }
    }
  }

  async function copy() {
    if (await copyText(markdown)) {
      toast.success(`Copied “${title}”`);
    } else {
      toast.error("Could not copy. Try Download instead.");
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          setCanShare(typeof navigator.share === "function");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={`Share ${title}`}>
          <Share2Icon aria-hidden="true" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canShare ? (
          <DropdownMenuItem onSelect={() => void shareNative()}>
            <SendIcon aria-hidden="true" />
            Share to an app…
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => void copy()}>
          <CopyIcon aria-hidden="true" />
          Copy text
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => downloadTextFile(itemFileName(title), markdown)}>
          <DownloadIcon aria-hidden="true" />
          Download as Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
