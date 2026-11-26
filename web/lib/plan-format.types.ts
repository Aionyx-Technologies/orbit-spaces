export type InlineSegment = {
  text: string;
  bold: boolean;
};

export type PlanBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };
