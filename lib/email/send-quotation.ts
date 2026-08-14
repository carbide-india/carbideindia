import "server-only";
import { Resend } from "resend";
import { QuotationSentEmail } from "@/emails/QuotationSent";
import type { Quotation } from "@/db/schema";
// Address handling lives in a server-only-free module so it can be unit-tested.
export { parseEmails, resolveRecipients } from "@/lib/email/quotation-recipients";

/**
 * Sending a quotation to the CUSTOMER.
 *
 * Separate from lib/email/resend.ts, which is the internal-notification sender:
 * this leaves the building. It carries an attachment, it goes to addresses typed
 * by a salesperson rather than to an employee row, and a silent failure here is
 * a customer who never got their quote — so unlike the notification senders,
 * this one REPORTS failure instead of no-opping when Resend is unconfigured.
 */

const FROM = process.env.RESEND_FROM_EMAIL || "Carbide India <onboarding@resend.dev>";

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export async function sendQuotationEmail(args: {
  quotation: Quotation;
  to: string[];
  cc: string[];
  pdf: Buffer;
  senderName: string;
  message?: string | null;
}): Promise<SendResult> {
  const { quotation, to, cc, pdf, senderName, message } = args;

  if (to.length === 0) {
    return { ok: false, error: "No recipient address — add a contact email on the enquiry first." };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Loud, not silent: the notification senders no-op without a key because a
    // missed in-app nudge is recoverable. A quote that the UI claims it sent and
    // never did is not.
    return {
      ok: false,
      error: "Email is not configured (RESEND_API_KEY is unset), so nothing was sent.",
    };
  }

  try {
    const { data, error } = await new Resend(key).emails.send({
      from: FROM,
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject: `Quotation ${quotation.quoteNo} from Carbide India`,
      react: QuotationSentEmail({
        quoteNo: quotation.quoteNo,
        companyName: quotation.companyName,
        productName: quotation.custProductName,
        quotePrice: quotation.quotePrice,
        validity: quotation.validity,
        deliveryTime: quotation.deliveryTime,
        message,
        senderName,
      }),
      attachments: [
        {
          filename: `${quotation.quoteNo.replace(/[^\w.-]+/g, "_")}.pdf`,
          content: pdf.toString("base64"),
        },
      ],
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not send the quotation.",
    };
  }
}
