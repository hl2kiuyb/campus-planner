import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const VALID_TYPES = new Set(["assignment", "exam", "event", "memo"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const VALID_STATUSES = new Set(["todo", "in_progress", "done"]);

let pool = null;
let memoryItems = [];

export class ValidationError extends Error {}

function shouldUseSsl(connectionString) {
  if (process.env.PGSSLMODE === "disable") {
    return false;
  }

  return !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
}

function serializeRow(row) {
  return {
    ...row,
    due_date: row.due_date ? new Date(row.due_date).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function requireChoice(field, value, choices) {
  if (!choices.has(value)) {
    throw new ValidationError(`${field} has an unsupported value.`);
  }
}

function normalizePayload(payload, { partial = false } = {}) {
  const normalized = {};

  if (!partial || Object.hasOwn(payload, "title")) {
    const title = String(payload.title ?? "").trim();
    if (!title) {
      throw new ValidationError("title is required.");
    }
    if (title.length > 120) {
      throw new ValidationError("title must be 120 characters or fewer.");
    }
    normalized.title = title;
  }

  if (!partial || Object.hasOwn(payload, "type")) {
    const type = payload.type || "assignment";
    requireChoice("type", type, VALID_TYPES);
    normalized.type = type;
  }

  if (!partial || Object.hasOwn(payload, "course")) {
    normalized.course = String(payload.course ?? "").trim().slice(0, 80);
  }

  if (!partial || Object.hasOwn(payload, "due_date")) {
    if (!payload.due_date) {
      normalized.due_date = null;
    } else {
      const dueDate = new Date(payload.due_date);
      if (Number.isNaN(dueDate.getTime())) {
        throw new ValidationError("due_date must be a valid date.");
      }
      normalized.due_date = dueDate.toISOString();
    }
  }

  if (!partial || Object.hasOwn(payload, "priority")) {
    const priority = payload.priority || "medium";
    requireChoice("priority", priority, VALID_PRIORITIES);
    normalized.priority = priority;
  }

  if (!partial || Object.hasOwn(payload, "status")) {
    const status = payload.status || "todo";
    requireChoice("status", status, VALID_STATUSES);
    normalized.status = status;
  }

  if (!partial || Object.hasOwn(payload, "memo")) {
    normalized.memo = String(payload.memo ?? "").trim().slice(0, 600);
  }

  return normalized;
}

function matchesFilters(item, filters = {}) {
  const search = String(filters.search ?? "").trim().toLowerCase();
  const type = filters.type || "all";
  const status = filters.status || "all";
  const priority = filters.priority || "all";
  const searchable = `${item.title} ${item.course} ${item.memo}`.toLowerCase();

  return (
    (!search || searchable.includes(search)) &&
    (type === "all" || item.type === type) &&
    (status === "all" || item.status === status) &&
    (priority === "all" || item.priority === priority)
  );
}

function sortForApi(items) {
  return [...items].sort((a, b) => {
    if (!a.due_date && !b.due_date) {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    if (!a.due_date) {
      return 1;
    }
    if (!b.due_date) {
      return -1;
    }
    return new Date(a.due_date) - new Date(b.due_date);
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDatabaseReady(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query("SELECT 1;");
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      console.log(`Waiting for PostgreSQL connection (${attempt}/${maxAttempts})...`);
      await wait(1000);
    }
  }
}

export async function initializeStorage() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return;
  }

  pool = new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
  });

  await waitForDatabaseReady();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS planner_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('assignment', 'exam', 'event', 'memo')),
      course TEXT NOT NULL DEFAULT '',
      due_date TIMESTAMPTZ,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
      memo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_planner_items_due_date ON planner_items (due_date);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_planner_items_status ON planner_items (status);");
}

export async function closeStorage() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function resetMemoryStorage() {
  memoryItems = [];
}

export function getStorageMode() {
  return pool ? "postgres" : "memory";
}

export async function listItems(filters = {}) {
  if (pool) {
    const result = await pool.query(`
      SELECT id, title, type, course, due_date, priority, status, memo, created_at, updated_at
      FROM planner_items
      ORDER BY due_date ASC NULLS LAST, created_at DESC;
    `);
    return result.rows.map(serializeRow).filter((item) => matchesFilters(item, filters));
  }

  return sortForApi(memoryItems).filter((item) => matchesFilters(item, filters));
}

export async function createItem(payload) {
  const data = normalizePayload(payload);
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    title: data.title,
    type: data.type,
    course: data.course,
    due_date: data.due_date,
    priority: data.priority,
    status: data.status,
    memo: data.memo,
    created_at: now,
    updated_at: now,
  };

  if (pool) {
    const result = await pool.query(
      `
        INSERT INTO planner_items
          (id, title, type, course, due_date, priority, status, memo, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, title, type, course, due_date, priority, status, memo, created_at, updated_at;
      `,
      [
        item.id,
        item.title,
        item.type,
        item.course,
        item.due_date,
        item.priority,
        item.status,
        item.memo,
        item.created_at,
        item.updated_at,
      ],
    );
    return serializeRow(result.rows[0]);
  }

  memoryItems = [item, ...memoryItems];
  return item;
}

export async function updateItem(id, payload) {
  const changes = normalizePayload(payload, { partial: true });
  const existing = pool
    ? await getItemFromPostgres(id)
    : memoryItems.find((item) => item.id === id);

  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    ...changes,
    updated_at: new Date().toISOString(),
  };

  if (pool) {
    const result = await pool.query(
      `
        UPDATE planner_items
        SET title = $1,
            type = $2,
            course = $3,
            due_date = $4,
            priority = $5,
            status = $6,
            memo = $7,
            updated_at = NOW()
        WHERE id = $8
        RETURNING id, title, type, course, due_date, priority, status, memo, created_at, updated_at;
      `,
      [
        updated.title,
        updated.type,
        updated.course,
        updated.due_date,
        updated.priority,
        updated.status,
        updated.memo,
        id,
      ],
    );
    return serializeRow(result.rows[0]);
  }

  memoryItems = memoryItems.map((item) => (item.id === id ? updated : item));
  return updated;
}

export async function deleteItem(id) {
  if (pool) {
    const result = await pool.query("DELETE FROM planner_items WHERE id = $1;", [id]);
    return result.rowCount > 0;
  }

  const beforeCount = memoryItems.length;
  memoryItems = memoryItems.filter((item) => item.id !== id);
  return memoryItems.length !== beforeCount;
}

async function getItemFromPostgres(id) {
  const result = await pool.query(
    `
      SELECT id, title, type, course, due_date, priority, status, memo, created_at, updated_at
      FROM planner_items
      WHERE id = $1;
    `,
    [id],
  );

  return result.rows[0] ? serializeRow(result.rows[0]) : null;
}
