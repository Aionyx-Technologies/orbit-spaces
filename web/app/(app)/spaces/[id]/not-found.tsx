import { Logo } from "@/components/brand/logo";
import { SpaceGone } from "@/components/space/space-gone";

export default function SpaceNotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10"
    >
      <div className="flex justify-center">
        <Logo />
      </div>
      <SpaceGone />
    </main>
  );
}
