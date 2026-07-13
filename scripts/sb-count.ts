import postgres from "postgres";

const sql = postgres(process.env.SB_URL!, { prepare: false, ssl: "require", max: 1 });

async function main() {
  const tables = ["employees", "clients", "inquiries", "items", "tasks", "master_options", "quotations", "costings"];
  for (const t of tables) {
    try {
      const r = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from "${t}"`);
      console.log(t.padEnd(16), r[0]?.n);
    } catch (e) {
      console.log(t.padEnd(16), "ERR", (e as Error).message.slice(0, 50));
    }
  }
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
