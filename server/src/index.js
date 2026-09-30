import { config } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { seedDemo, syncDeployments } from "./seed/seed.js";
import { startIndexer } from "./services/indexer.js";
import { mailEnabled } from "./email/mailer.js";

openDb();
if (config.seedDemo) seedDemo();
syncDeployments();

const app = createApp();
app.listen(config.port, () => {
  console.log(`[api] ${config.platformName} API listening on http://localhost:${config.port}`);
  console.log(`[api] email: ${mailEnabled() ? `SMTP ${config.mail.host}` : "SMTP not configured – emails are logged to /api/dev/emails"}`);
  startIndexer();
});
