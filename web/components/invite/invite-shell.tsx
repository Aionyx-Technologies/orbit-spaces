import { Logo } from "@/components/brand/logo";
import type { InviteShellProps } from "@/components/invite/invite-shell.types";
import { Card, CardContent } from "@/components/ui/card";

export function InviteShell({ children }: InviteShellProps) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10"
    >
      <div className="flex justify-center">
        <Logo />
      </div>
      <Card>
        <CardContent className="p-6 pb-6 sm:p-7 sm:pb-7">{children}</CardContent>
      </Card>
    </main>
  );
}
