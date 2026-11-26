import type { Fact, TemplateFact } from "@/lib/api.types";

export function upsertFact(facts: Fact[], fact: Fact): Fact[] {
  const wanted = fact.key.toLowerCase();
  const index = facts.findIndex((existing) => existing.key.toLowerCase() === wanted);
  if (index === -1) {
    return [...facts, fact];
  }
  return facts.map((existing, position) => (position === index ? fact : existing));
}

export function replaceFact(facts: Fact[], previousKey: string, fact: Fact): Fact[] {
  const wanted = previousKey.toLowerCase();
  const index = facts.findIndex((existing) => existing.key.toLowerCase() === wanted);
  if (index === -1) {
    return upsertFact(facts, fact);
  }
  return facts.map((existing, position) => (position === index ? fact : existing));
}

export function removeFact(facts: Fact[], key: string): Fact[] {
  const wanted = key.toLowerCase();
  return facts.filter((existing) => existing.key.toLowerCase() !== wanted);
}

export function unsetFacts(suggested: TemplateFact[], facts: Fact[]): TemplateFact[] {
  const set = new Set(facts.map((fact) => fact.key.toLowerCase()));
  return suggested.filter((suggestion) => !set.has(suggestion.key.toLowerCase()));
}
