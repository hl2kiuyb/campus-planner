import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  createItem,
  deleteItem,
  getStorageMode,
  listItems,
  updateItem,
  ValidationError,
} from "./store.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(serverDir, "..", "dist");

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (req, res) => {
    res.status(200).json({
      ok: true,
      service: "campus-planner",
      storage: getStorageMode(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get(
    "/api/items",
    asyncRoute(async (req, res) => {
      const items = await listItems(req.query);
      res.status(200).json({ items });
    }),
  );

  app.post(
    "/api/items",
    asyncRoute(async (req, res) => {
      const item = await createItem(req.body);
      res.status(201).json({ item });
    }),
  );

  app.patch(
    "/api/items/:id",
    asyncRoute(async (req, res) => {
      const item = await updateItem(req.params.id, req.body);

      if (!item) {
        return res.status(404).json({ error: "Item not found." });
      }

      return res.status(200).json({ item });
    }),
  );

  app.delete(
    "/api/items/:id",
    asyncRoute(async (req, res) => {
      const deleted = await deleteItem(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: "Item not found." });
      }

      return res.status(204).end();
    }),
  );

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found." });
  });

  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof SyntaxError && "body" in error) {
      return res.status(400).json({ error: "Invalid JSON request body." });
    }

    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  });

  return app;
}
