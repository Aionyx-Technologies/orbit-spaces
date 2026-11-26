import { LogoMark } from "@/components/brand/logo";
import type { PersonAvatarProps } from "@/components/common/person-avatar.types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { personTone, toneVars } from "@/lib/assistants";
import { cssVars } from "@/lib/css-vars";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-6 text-[0.6875rem]",
  md: "size-8 text-[0.8125rem]",
  lg: "size-9 text-sm",
  xl: "size-20 text-2xl",
} as const;

export function PersonAvatar({
  name,
  src = null,
  orbit = false,
  size = "md",
  label,
  className,
}: PersonAvatarProps) {
  const described =
    label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label };
  return (
    <Avatar {...described} className={cn(SIZES[size], className)}>
      {src && !orbit ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback
        className={orbit ? "bg-accent text-primary" : "source-soft"}
        style={orbit ? undefined : cssVars(toneVars(personTone(name ?? "?")))}
      >
        {orbit ? <LogoMark className="size-4" /> : initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
