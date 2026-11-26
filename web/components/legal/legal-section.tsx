import type { LegalSectionProps } from "@/components/legal/legal-section.types";

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="heading-section">{title}</h2>
      <div className="flex flex-col gap-3 text-base text-pretty [&_a]:underline [&_a]:underline-offset-4 [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </section>
  );
}
