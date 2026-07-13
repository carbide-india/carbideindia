import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The Recycle Bin is now per-form (`/clients/recycle-bin`, `/samples/recycle-bin`,
 * …) so the bins never mix. This legacy global route redirects to the Client
 * KYC bin as a sensible default.
 */
export default function LegacyRecycleBinRedirect() {
  redirect("/clients/recycle-bin");
}
