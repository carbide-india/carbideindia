const u = process.env.DATABASE_URL;
if (!u) {
  console.log("DATABASE_URL not set");
  process.exit(1);
}
const url = new URL(u);
console.log("host   :", url.host);
console.log("port   :", url.port);
console.log("sslmode:", url.searchParams.get("sslmode") ?? "(none)");
console.log("is supabase:", /supabase/.test(url.host));
console.log("is neon    :", /neon/.test(url.host));
