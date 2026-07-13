import postgres from "postgres";

const sql = postgres(process.env.SB_URL!, { prepare: false, ssl: "require", max: 1 });

async function main() {
  const r = await sql<
    { table_name: string; column_name: string; is_identity: string; identity_generation: string | null; column_default: string | null }[]
  >`
    select table_name, column_name, is_identity, identity_generation, column_default
    from information_schema.columns
    where table_schema = 'public'
      and (is_identity = 'YES' or column_default like 'nextval%')
    order by table_name, column_name`;
  for (const c of r) {
    console.log(
      `${c.table_name}.${c.column_name}  identity=${c.is_identity} ${c.identity_generation ?? ""}  default=${(c.column_default ?? "").slice(0, 45)}`,
    );
  }
}

main()
  .catch((e) => {
    console.error("ERR", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
