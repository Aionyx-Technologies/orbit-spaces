import type { ProvenanceSource } from "@/lib/provenance.types";

export type ProvenanceLineProps = Readonly<{
  source: ProvenanceSource;
  createdAt: string;
  meId: string | null;
  className?: string;
}>;
