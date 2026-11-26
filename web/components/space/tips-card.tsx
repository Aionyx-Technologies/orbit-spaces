import { LightbulbIcon } from "lucide-react";

import type { TipsCardProps } from "@/components/space/tips-card.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TipsCard({ templateName, tips }: TipsCardProps) {
  if (tips.length === 0) {
    return null;
  }
  return (
    <Card aria-labelledby="tips-title" role="region">
      <CardHeader>
        <CardTitle id="tips-title">Ideas to get started</CardTitle>
        <CardDescription>From the {templateName} template.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {tips.map((tip, index) => (
            <li key={index} className="flex items-start gap-3 text-base">
              <LightbulbIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
              <span className="break-words">{tip}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
