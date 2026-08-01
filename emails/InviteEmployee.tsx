import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "@/emails/_layout";
import { PrimaryButton } from "@/emails/_components";

/**
 * Onboarding invitation email (Firebase auth).
 *
 * Sent by `inviteEmployee` / `resendInvite` after an employees row is created
 * and a Firebase password-reset (onboarding) link is minted. The recipient
 * clicks through to `/accept-invite?oobCode=…`, sets a password, and is signed
 * in; on first sign-in `getCurrentEmployee()` links the Firebase user to the
 * employees row by verified email and backfills `firebase_uid`.
 */
export function InviteEmployeeEmail({
  name,
  onboardingUrl,
}: {
  name: string;
  onboardingUrl: string;
}) {
  const firstName = name.trim().split(/\s+/)[0] || name;
  return (
    <EmailLayout preview="Set up your Carbide India WMS account">
      <Heading
        as="h1"
        style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}
      >
        Welcome to Carbide India WMS
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 8px" }}>
        Hi {firstName},
      </Text>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 20px" }}>
        An administrator has invited you to Carbide India&apos;s work-management
        system. Set a password to activate your account — you&apos;ll be signed
        in straight away.
      </Text>
      <div style={{ margin: "0 0 20px" }}>
        <PrimaryButton href={onboardingUrl}>Set up your account</PrimaryButton>
      </div>
      <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, margin: 0 }}>
        If the button doesn&apos;t work, copy and paste this link into your
        browser:
      </Text>
      <Text style={{ fontSize: 12, color: "#3F3F94", lineHeight: 1.6, margin: "4px 0 0", wordBreak: "break-all" }}>
        {onboardingUrl}
      </Text>
    </EmailLayout>
  );
}

export default InviteEmployeeEmail;
