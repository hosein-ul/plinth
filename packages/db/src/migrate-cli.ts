import { connect } from "./client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (e.g. postgres://plinth:plinth@localhost:5432/plinth)");
  process.exit(1);
}
const handle = connect(url);
await handle.migrate();
console.log(`migrations applied (${handle.kind})`);
await handle.close();
