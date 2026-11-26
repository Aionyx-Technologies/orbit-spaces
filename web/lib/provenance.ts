import type { Fact, Item } from "@/lib/api.types";
import type { Provenance, ProvenanceSource } from "@/lib/provenance.types";

export const FORMER_MEMBER = "Former member";
export const WEB_ORIGIN = "web";
export const ORBIT_SUGGESTION_ORIGIN = "orbit-suggestion";

export function itemSource(
  item: Pick<Item, "author_kind" | "shared_by" | "via">,
): ProvenanceSource {
  return { person: item.shared_by, via: item.via, orbit: item.author_kind === "orbit" };
}

export function factSource(fact: Pick<Fact, "set_by" | "via">): ProvenanceSource {
  return { person: fact.set_by, via: fact.via };
}

export function describeProvenance(source: ProvenanceSource, meId: string | null): Provenance {
  const isOrbit = source.orbit === true;
  const isYou = !isOrbit && meId !== null && source.person?.user_id === meId;
  const fromWeb = source.via === WEB_ORIGIN;
  if (isOrbit) {
    return {
      who: "Orbit",
      via: fromWeb ? "requested on the web" : `requested via ${source.via}`,
      isYou: false,
      isOrbit: true,
    };
  }
  const name = isYou ? "You" : (source.person?.display_name ?? FORMER_MEMBER);
  return {
    who: name,
    via: fromWeb
      ? "on the web"
      : source.via === ORBIT_SUGGESTION_ORIGIN
        ? "suggested by Orbit"
        : `via ${source.via}`,
    isYou,
    isOrbit: false,
  };
}
