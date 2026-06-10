// Disabled for Carbide India — the dashboard starts with empty data.
// Admin populates employees, departments, and tasks via /admin/* in the UI.
//
// If you ever want demo/dev data back, restore from git history (commit prior
// to the Carbide India rebrand) or write a fresh fixture set tailored to
// Carbide India's actual departments.

console.log("Seed disabled — Carbide India starts with empty data.");
console.log("Bootstrap your first admin:");
console.log('  pnpm bootstrap-admin -- --email heteshvichare927@gmail.com --name "Hetesh Vichare"');
console.log("Then add employees and tasks via /admin/* in the UI.");
process.exit(0);
