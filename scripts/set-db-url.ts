/**
 * Surgically set the active DATABASE_URL line in .env.local without exposing
 * the file's other secrets. Backs up to .env.local.bak first. The new value is
 * passed via NEW_DB_URL (never hard-coded). Prints only status + host.
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const PATH = ".env.local";
const NEW = process.env.NEW_DB_URL;
if (!NEW) throw new Error("NEW_DB_URL not set");

const text = readFileSync(PATH, "utf8");
copyFileSync(PATH, PATH + ".bak");

const lines = text.split(/\r?\n/);
let replaced = 0;
let commentedExtra = 0;
const out = lines.map((l) => {
  const isAssign = /^\s*DATABASE_URL\s*=/.test(l);
  const isCommented = /^\s*#/.test(l);
  if (isAssign && !isCommented) {
    if (replaced === 0) {
      replaced++;
      return `DATABASE_URL=${NEW}`;
    }
    commentedExtra++;
    return `# ${l}`;
  }
  return l;
});
if (replaced === 0) {
  out.push(`DATABASE_URL=${NEW}`);
  replaced = 1;
  console.log("no active DATABASE_URL found — appended");
}
writeFileSync(PATH, out.join("\n"));

console.log(`active DATABASE_URL lines replaced: ${replaced}, extra commented: ${commentedExtra}`);
console.log("new host:", new URL(NEW).host);
console.log("backup saved: .env.local.bak");
