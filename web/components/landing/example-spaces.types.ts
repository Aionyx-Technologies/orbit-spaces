export type ExampleShare = Readonly<{
  title: string;
  person: string;
  /** An assistant name, or "web" for someone without one. */
  source: string;
  when: string;
}>;

export type Example = Readonly<{
  /** The built-in template id this example stands for. */
  id: string;
  chip: string;
  icon: string;
  group: "Life" | "Work";
  space: string;
  shares: readonly [ExampleShare, ExampleShare, ExampleShare];
  orbit: Readonly<{ kind: "settle" | "plan"; text: string }>;
}>;
