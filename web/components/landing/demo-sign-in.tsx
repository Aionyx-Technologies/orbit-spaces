import type { DemoSignInProps } from "@/components/landing/demo-sign-in.types";
import { buttonVariants } from "@/components/ui/button";

export function DemoSignIn({ people }: DemoSignInProps) {
  return (
    <section
      aria-labelledby="demo-title"
      className="flex w-full max-w-lg flex-col gap-4 rounded-lg border p-5 text-left shadow-card glass"
    >
      <div className="flex flex-col gap-1">
        <h2 id="demo-title" className="text-base font-semibold">
          Try the demo
        </h2>
        <p className="text-sm text-muted-foreground">
          Demo mode is on for this server. Skip the email and look around as a test person.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {people.map((person) => (
          <form key={person.key} method="post" action="/auth/demo" className="flex-1">
            <input type="hidden" name="person" value={person.key} />
            <button
              type="submit"
              className={buttonVariants({ variant: "outline", className: "w-full" })}
            >
              Continue as {person.name}
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
