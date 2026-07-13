import { DraftsScreen } from "@/components/drafts/drafts-screen";

export const dynamic = "force-dynamic";

export default async function SalesOrderDraftsPage() {
  return <DraftsScreen kind="sales-order" />;
}
