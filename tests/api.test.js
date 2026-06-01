import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

process.env.DATABASE_URL = "";

const { createApp } = await import("../server/app.js");
const { closeStorage, initializeStorage, resetMemoryStorage } = await import("../server/store.js");

let server;
let baseUrl;

before(async () => {
  await initializeStorage();
  server = await new Promise((resolve) => {
    const instance = createApp().listen(0, () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  resetMemoryStorage();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeStorage();
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const hasBody = response.status !== 204;
  const body = hasBody ? await response.json() : null;
  return { response, body };
}

test("health endpoint reports service status", async () => {
  const { response, body } = await request("/api/health");

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.storage, "memory");
});

test("creates and lists planner items", async () => {
  const dueDate = "2026-06-09T14:59:00.000Z";
  const { response: createResponse, body: createBody } = await request("/api/items", {
    method: "POST",
    body: JSON.stringify({
      title: "Last Lab 발표 영상",
      type: "assignment",
      course: "웹프로그래밍",
      due_date: dueDate,
      priority: "high",
      status: "todo",
      memo: "7분 이내",
    }),
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createBody.item.title, "Last Lab 발표 영상");
  assert.equal(createBody.item.due_date, dueDate);

  const { response: listResponse, body: listBody } = await request("/api/items");

  assert.equal(listResponse.status, 200);
  assert.equal(listBody.items.length, 1);
  assert.equal(listBody.items[0].course, "웹프로그래밍");
});

test("updates and deletes planner items", async () => {
  const { body: createBody } = await request("/api/items", {
    method: "POST",
    body: JSON.stringify({
      title: "데이터베이스 연결",
      type: "event",
      priority: "medium",
      status: "todo",
    }),
  });

  const itemId = createBody.item.id;
  const { response: updateResponse, body: updateBody } = await request(`/api/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "done" }),
  });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateBody.item.status, "done");

  const { response: deleteResponse } = await request(`/api/items/${itemId}`, {
    method: "DELETE",
  });

  assert.equal(deleteResponse.status, 204);

  const { body: listBody } = await request("/api/items");
  assert.equal(listBody.items.length, 0);
});

test("rejects invalid payloads", async () => {
  const { response, body } = await request("/api/items", {
    method: "POST",
    body: JSON.stringify({
      title: "",
      type: "unknown",
    }),
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /title/i);
});
