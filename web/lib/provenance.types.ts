import type { Person } from "@/lib/api.types";

export type ProvenanceSource = {
  person: Person | null;
  via: string;
  orbit?: boolean;
};

export type Provenance = {
  who: string;
  via: string;
  isYou: boolean;
  isOrbit: boolean;
};
