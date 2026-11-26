import Link from "next/link";

import { PersonAvatar } from "@/components/common/person-avatar";
import type { SettingsLinkProps } from "@/components/layout/settings-link.types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SIGNED_IN_ID = "signed-in-as";

export function SettingsLink({ name, avatarUrl = null, selected }: SettingsLinkProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/settings"
            aria-describedby={SIGNED_IN_ID}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "ml-0.5 rounded-full",
              selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
          >
            <PersonAvatar name={name} src={avatarUrl} size="lg" label="Settings" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <span id={SIGNED_IN_ID} className="sr-only">
        Signed in as {name}
      </span>
    </TooltipProvider>
  );
}
