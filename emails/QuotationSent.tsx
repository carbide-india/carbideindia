import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * The quotation email that goes to the CUSTOMER — not an internal notification.
 *
 * Deliberately plain: the quote itself is the attached PDF, so the body's only
 * job is to say who it is from, what it is for, and what the price and validity
 * are, so the recipient can read it on a phone without opening the attachment.
 */
export interface QuotationSentEmailProps {
  quoteNo: string;
  companyName: string | null;
  productName: string | null;
  quotePrice: string | null;
  validity: string | null;
  deliveryTime: string | null;
  /** Free-text the sender added in the send dialog. */
  message?: string | null;
  senderName: string;
}

const brand = "#3F3F94";

export function QuotationSentEmail({
  quoteNo,
  companyName,
  productName,
  quotePrice,
  validity,
  deliveryTime,
  message,
  senderName,
}: QuotationSentEmailProps) {
  const rows: [string, string][] = [
    ["Quotation No", quoteNo],
    ["Product", productName?.trim() || "—"],
    ["Price", quotePrice ? `Rs. ${quotePrice}` : "—"],
    ["Validity", validity?.trim() || "—"],
    ["Delivery", deliveryTime?.trim() || "—"],
  ];

  return (
    <Html>
      <Head />
      <Preview>{`Quotation ${quoteNo} from Carbide India`}</Preview>
      <Body style={{ backgroundColor: "#f4f5f7", fontFamily: "Arial, sans-serif", margin: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px 0" }}>
          <Section
            style={{
              background: "#ffffff",
              borderRadius: 14,
              padding: "28px 28px 24px",
              border: "1px solid #e5e7eb",
            }}
          >
            <Text
              style={{
                margin: 0,
                color: brand,
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: 1.4,
              }}
            >
              CARBIDE INDIA
            </Text>
            <Text style={{ margin: "2px 0 20px", color: "#8a90a0", fontSize: 11 }}>
              Your Tungsten Carbide &amp; Tungsten Copper Partners
            </Text>

            <Heading style={{ margin: "0 0 6px", fontSize: 19, color: "#14151a" }}>
              Quotation {quoteNo}
            </Heading>
            <Text style={{ margin: "0 0 18px", fontSize: 14, color: "#4b5563" }}>
              {companyName ? `For ${companyName}. ` : ""}
              The full quotation is attached as a PDF.
            </Text>

            {message?.trim() ? (
              <Section
                style={{
                  background: "#f7f7fd",
                  borderLeft: `3px solid ${brand}`,
                  borderRadius: 6,
                  padding: "10px 14px",
                  margin: "0 0 18px",
                }}
              >
                <Text style={{ margin: 0, fontSize: 14, color: "#3a4152", whiteSpace: "pre-wrap" }}>
                  {message.trim()}
                </Text>
              </Section>
            ) : null}

            <Section style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
              {rows.map(([label, value]) => (
                <Text key={label} style={{ margin: "0 0 8px", fontSize: 13, color: "#14151a" }}>
                  <span style={{ color: "#8a90a0" }}>{label}:</span>{" "}
                  <strong>{value}</strong>
                </Text>
              ))}
            </Section>

            <Text style={{ margin: "20px 0 0", fontSize: 13, color: "#4b5563" }}>
              Regards,
              <br />
              {senderName}
              <br />
              Carbide India
            </Text>
          </Section>

          <Text style={{ margin: "14px 0 0", fontSize: 11, color: "#8a90a0", textAlign: "center" }}>
            Yogeshwar Engineering Pvt Ltd · W-150(A) MIDC Ambad, Nashik · carbideindia.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default QuotationSentEmail;
