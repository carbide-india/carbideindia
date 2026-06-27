import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listMasterOptions } from "@/lib/queries/masters";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getClientForEdit } from "@/lib/queries/clients";
import { getClientDocuments } from "@/lib/queries/client-documents";
import { db } from "@/lib/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { KycForm } from "@/components/clients/kyc-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditClientPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const [client, customerTypes, industryTypes, productTypes, employees, documents] =
    await Promise.all([
      getClientForEdit(id),
      listMasterOptions("customer_type"),
      listMasterOptions("industry_type"),
      listMasterOptions("product_type"),
      listEmployeeOptions(),
      getClientDocuments(id),
    ]);

  if (!client) notFound();

  // Fetch clientCode separately (not part of ClientEditValues which is
  // shaped for form prefill — clientCode is read-only display only).
  const [clientRow] = await db
    .select({ clientCode: clients.clientCode })
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  const clientCode = clientRow?.clientCode ?? undefined;

  return (
    <div>
      <header className="mb-6">
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Clients
        </Link>
        <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
          Admin · Edit Client
        </div>
        <h1 className="text-display-lg text-ink-strong mt-1">{client.name}</h1>
        <p className="text-body-lg text-ink-subtle mt-1">
          Edit every detail of this client — company, contact, meeting and
          business cards. Option lists are managed in Admin &#8594; Masters.
        </p>
      </header>
      <KycForm
        customerTypes={customerTypes}
        industryTypes={industryTypes}
        productTypes={productTypes}
        employees={employees}
        editClientId={id}
        initialValues={client}
        clientCode={clientCode}
        documents={documents}
      />
    </div>
  );
}
