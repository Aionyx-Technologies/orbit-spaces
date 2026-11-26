import { BackLink } from "@/components/common/back-link";
import { PolicyLinks } from "@/components/legal/policy-links";
import { AssistantsAnchorRedirect } from "@/components/settings/assistants-anchor-redirect";
import { BillingSection } from "@/components/settings/billing-section";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { PreferencesSection } from "@/components/settings/preferences-section";
import { ProfileSection } from "@/components/settings/profile-section";
import { SecuritySection } from "@/components/settings/security-section";
import type { SettingsScreenProps } from "@/components/settings/settings-screen.types";
import { YourDataSection } from "@/components/settings/your-data-section";

export function SettingsScreen({ me, initialSpaces }: SettingsScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <BackLink href="/spaces">Spaces</BackLink>
        <h1 className="heading-page">Settings</h1>
      </div>
      <AssistantsAnchorRedirect />
      <ProfileSection me={me} />
      <BillingSection me={me} />
      <NotificationsSection
        initial={initialSpaces}
        frequency={me.email_frequency}
        timeZone={me.time_zone}
      />
      <PreferencesSection me={me} initialSpaces={initialSpaces} />
      <SecuritySection me={me} />
      <YourDataSection />
      <div className="mt-4">
        <DeleteAccountSection />
      </div>
      <PolicyLinks />
    </div>
  );
}
