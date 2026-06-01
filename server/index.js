import { createApp } from "./app.js";
import { closeStorage, initializeStorage } from "./store.js";

const port = Number(process.env.API_PORT || process.env.PORT || 3001);
const app = createApp();

await initializeStorage();

const server = app.listen(port, () => {
  console.log(`Campus Planner API listening on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await closeStorage();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
