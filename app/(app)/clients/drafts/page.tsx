import { DraftsScreen } from "@/components/drafts/drafts-screen";

export const dynamic = "force-dynamic";

export default async function ClientKycDraftsPage() {
  return <DraftsScreen kind="kyc" />;
}
