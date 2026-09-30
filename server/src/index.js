import fs from "node:fs";
import path from "node:path";
import { ROOT, config } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { seedDemo, syncDeployments } from "./seed/seed.js";
import { startIndexer } from "./services/indexer.js";
import { mailEnabled } from "./email/mailer.js";

openDb();
if (config.seedDemo) seedDemo();
syncDeployments();

// Re-link on-chain ids whenever contracts are (re)deployed while the API is running.
const deploymentsFile = process.env.DEPLOYMENTS_FILE || path.join(ROOT, "web/src/config/deployments.json");
if (fs.existsSync(deploymentsFile)) {
  fs.watchFile(deploymentsFile, { interval: 2000 }, () => {
    try {
      syncDeployments();
      console.log("[api] deployments changed – on-chain listings re-linked");
    } catch (err) {
      console.error("[api] failed to sync deployments:", err.message);
    }
  });
}

const app = createApp();
app.listen(config.port, () => {
  console.log(`[api] ${config.platformName} API listening on http://localhost:${config.port}`);
  console.log(`[api] email: ${mailEnabled() ? `SMTP ${config.mail.host}` : "SMTP not configured – emails are logged to /api/dev/emails"}`);
  startIndexer();
});
