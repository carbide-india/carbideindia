// Backfill the normalized client child tables (ERP Phase 2 — Customer Master
// normalization). Copies each client's legacy address/bank columns into the
// new client_addresses / client_bank_accounts tables. Idempotent: a client
// that already has any child row of the relevant kind is skipped entirely.
//
//   npx tsx --env-file=.env.local scripts/backfill-client-children.ts
//
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const nonEmpty = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

async function main() {
  const clients = await sql<
    {
      id: string;
      address_line_1: string | null;
      address_line_2: string | null;
      address_line_3: string | null;
      address_line_4: string | null;
      city: string | null;
      state: string | null;
      country: string | null;
      pin_code: string | null;
      gstin: string | null;
      bill_to_address: string | null;
      ship_to_address: string | null;
      bank_name: string | null;
      bank_account_no: string | null;
      bank_ifsc: string | null;
      bank_branch: string | null;
      bank_account_holder: string | null;
    }[]
  >`
    SELECT id, address_line_1, address_line_2, address_line_3, address_line_4,
           city, state, country, pin_code, gstin, bill_to_address, ship_to_address,
           bank_name, bank_account_no, bank_ifsc, bank_branch, bank_account_holder
    FROM clients
    ORDER BY created_at ASC, name ASC
  `;

  let addressRows = 0;
  let bankRows = 0;
  let clientsWithAddresses = 0;
  let clientsWithBank = 0;

  for (const c of clients) {
    // ── Addresses ──────────────────────────────────────────────────────────
    const existingAddr = (
      await sql`SELECT 1 FROM client_addresses WHERE client_id = ${c.id} LIMIT 1`
    )[0];
    if (!existingAddr) {
      let touched = false;

      // registered — from the legacy structured address columns, only if any
      // of them carry a value.
      const reg = {
        line1: nonEmpty(c.address_line_1),
        line2: nonEmpty(c.address_line_2),
        line3: nonEmpty(c.address_line_3),
        line4: nonEmpty(c.address_line_4),
        city: nonEmpty(c.city),
        state: nonEmpty(c.state),
        country: nonEmpty(c.country),
        pinCode: nonEmpty(c.pin_code),
        gstin: nonEmpty(c.gstin),
      };
      const hasReg = Object.values(reg).some((v) => v !== null);
      if (hasReg) {
        await sql`
          INSERT INTO client_addresses
            (client_id, address_type, is_primary, line_1, line_2, line_3, line_4,
             city, state, country, pin_code, gstin, sort_order)
          VALUES
            (${c.id}, 'registered', true, ${reg.line1}, ${reg.line2}, ${reg.line3},
             ${reg.line4}, ${reg.city}, ${reg.state}, ${reg.country}, ${reg.pinCode},
             ${reg.gstin}, 0)
        `;
        addressRows++;
        touched = true;
      }

      // bill_to — free-text legacy column → line_1.
      const billTo = nonEmpty(c.bill_to_address);
      if (billTo) {
        await sql`
          INSERT INTO client_addresses
            (client_id, address_type, is_primary, line_1, sort_order)
          VALUES (${c.id}, 'bill_to', true, ${billTo}, 0)
        `;
        addressRows++;
        touched = true;
      }

      // ship_to — free-text legacy column → line_1.
      const shipTo = nonEmpty(c.ship_to_address);
      if (shipTo) {
        await sql`
          INSERT INTO client_addresses
            (client_id, address_type, is_primary, line_1, sort_order)
          VALUES (${c.id}, 'ship_to', true, ${shipTo}, 0)
        `;
        addressRows++;
        touched = true;
      }

      if (touched) clientsWithAddresses++;
    }

    // ── Bank account ───────────────────────────────────────────────────────
    const existingBank = (
      await sql`SELECT 1 FROM client_bank_accounts WHERE client_id = ${c.id} LIMIT 1`
    )[0];
    if (!existingBank) {
      const bank = {
        bankName: nonEmpty(c.bank_name),
        accountNo: nonEmpty(c.bank_account_no),
        ifsc: nonEmpty(c.bank_ifsc),
        branch: nonEmpty(c.bank_branch),
        accountHolder: nonEmpty(c.bank_account_holder),
      };
      const hasBank = Object.values(bank).some((v) => v !== null);
      if (hasBank) {
        await sql`
          INSERT INTO client_bank_accounts
            (client_id, is_primary, bank_name, account_no, ifsc, branch, account_holder, sort_order)
          VALUES
            (${c.id}, true, ${bank.bankName}, ${bank.accountNo}, ${bank.ifsc},
             ${bank.branch}, ${bank.accountHolder}, 0)
        `;
        bankRows++;
        clientsWithBank++;
      }
    }
  }

  console.log(
    `backfill complete: ${addressRows} address row(s) across ${clientsWithAddresses} client(s); ` +
      `${bankRows} bank row(s) across ${clientsWithBank} client(s); ` +
      `scanned ${clients.length} client(s).`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
