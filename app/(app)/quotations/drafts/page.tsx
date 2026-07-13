import { DraftsScreen } from "@/components/drafts/drafts-screen";

export const dynamic = "force-dynamic";

export default async function QuotationDraftsPage() {
  return <DraftsScreen kind="quotation" />;
}
