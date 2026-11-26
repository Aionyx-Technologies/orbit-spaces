import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const ACCOUNT_EXPORT_PATH = "/api/me/export";

export function YourDataSection() {
  return (
    <Card aria-labelledby="your-data-title" role="region">
      <CardHeader>
        <CardTitle id="your-data-title">Your data</CardTitle>
        <CardDescription>
          Download a copy of what Orbit holds about you: your account, your spaces with everything
          in them, what you shared, your invitations, connected assistants and sign-ins.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Button asChild variant="outline">
            <a href={ACCOUNT_EXPORT_PATH} download>
              <DownloadIcon aria-hidden="true" />
              Download my data
            </a>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          It is one JSON file. It never includes sign-in links, access keys or other people&rsquo;s
          email addresses. You can download it a few times a day.
        </p>
      </CardContent>
    </Card>
  );
}
