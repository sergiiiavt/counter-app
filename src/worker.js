const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const ENTRY_SOURCES = new Set(["web", "iphone", "watch", "siri", "shortcut", "unknown"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function isDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function currentUser(env) {
  // V1 development mode only.
  // Production must replace this with validated authentication.
  if (String(env.DEMO_MODE).toLowerCase() === "true") {
    return { id: "demo-user" };
  }
  return null;
}

async function ensureDefaultWaterCounter(db, userId) {
  const now = new Date().toISOString();
  await db
    .prepare(`
      INSERT OR IGNORE INTO counters
        (user_id, id, name, unit, aggregation, daily_goal, presets_json, created_at, updated_at)
      VALUES (?, 'water', 'Water', 'ml', 'sum', 2000, '[100,250,500]', ?, ?)
    `)
    .bind(userId, now, now)
    .run();
}

async function getDaily(db, userId, counterId, date) {
  const row = await db
    .prepare(`
      SELECT
        COALESCE(SUM(amount), 0) AS total,
        COUNT(*) AS entry_count
      FROM counter_entries
      WHERE user_id = ? AND counter_id = ? AND local_date = ?
    `)
    .bind(userId, counterId, date)
    .first();

  return {
    counterId,
    date,
    total: Number(row?.total ?? 0),
    entryCount: Number(row?.entry_count ?? 0),
  };
}

async function handleApi(request, env, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "counter-app", time: new Date().toISOString() });
  }

  const user = currentUser(env);
  if (!user) {
    return json(
      {
        error: "authentication_required",
        message: "Authentication is not configured yet. DEMO_MODE is disabled.",
      },
      401,
    );
  }

  await ensureDefaultWaterCounter(env.DB, user.id);

  if (url.pathname === "/api/counters" && request.method === "GET") {
    const result = await env.DB
      .prepare(`
        SELECT id, name, unit, aggregation, daily_goal, presets_json
        FROM counters
        WHERE user_id = ?
        ORDER BY created_at ASC
      `)
      .bind(user.id)
      .all();

    const counters = (result.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      aggregation: row.aggregation,
      dailyGoal: row.daily_goal == null ? null : Number(row.daily_goal),
      presets: JSON.parse(row.presets_json || "[]"),
    }));

    return json({ counters });
  }

  if (url.pathname === "/api/daily" && request.method === "GET") {
    const counterId = url.searchParams.get("counterId") || "water";
    const date = url.searchParams.get("date");

    if (!isDateOnly(date)) {
      return json({ error: "invalid_date", message: "date must be YYYY-MM-DD" }, 400);
    }

    return json(await getDaily(env.DB, user.id, counterId, date));
  }

  if (url.pathname === "/api/entries" && request.method === "GET") {
    const counterId = url.searchParams.get("counterId") || "water";
    const date = url.searchParams.get("date");

    if (!isDateOnly(date)) {
      return json({ error: "invalid_date", message: "date must be YYYY-MM-DD" }, 400);
    }

    const result = await env.DB
      .prepare(`
        SELECT id, counter_id, amount, occurred_at, local_date, source
        FROM counter_entries
        WHERE user_id = ? AND counter_id = ? AND local_date = ?
        ORDER BY occurred_at DESC
        LIMIT 100
      `)
      .bind(user.id, counterId, date)
      .all();

    return json({
      entries: (result.results ?? []).map((row) => ({
        id: row.id,
        counterId: row.counter_id,
        amount: Number(row.amount),
        occurredAt: row.occurred_at,
        localDate: row.local_date,
        source: row.source,
      })),
    });
  }

  if (url.pathname === "/api/entries" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const counterId = typeof body.counterId === "string" ? body.counterId.trim() : "";
    const amount = Number(body.amount);
    const localDate = body.localDate;
    const occurredAt = body.occurredAt || new Date().toISOString();
    const source = ENTRY_SOURCES.has(body.source) ? body.source : "unknown";

    if (!id || id.length > 100) {
      return json({ error: "invalid_id" }, 400);
    }
    if (!counterId || counterId.length > 100) {
      return json({ error: "invalid_counter" }, 400);
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      return json({ error: "invalid_amount", message: "amount must be > 0 and <= 10000" }, 400);
    }
    if (!isDateOnly(localDate)) {
      return json({ error: "invalid_date", message: "localDate must be YYYY-MM-DD" }, 400);
    }
    if (Number.isNaN(Date.parse(occurredAt))) {
      return json({ error: "invalid_timestamp" }, 400);
    }

    const counter = await env.DB
      .prepare(`SELECT id FROM counters WHERE user_id = ? AND id = ?`)
      .bind(user.id, counterId)
      .first();

    if (!counter) {
      return json({ error: "counter_not_found" }, 404);
    }

    const now = new Date().toISOString();
    await env.DB
      .prepare(`
        INSERT OR IGNORE INTO counter_entries
          (id, user_id, counter_id, amount, occurred_at, local_date, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(id, user.id, counterId, amount, new Date(occurredAt).toISOString(), localDate, source, now)
      .run();

    return json({
      entry: { id, counterId, amount, occurredAt: new Date(occurredAt).toISOString(), localDate, source },
      daily: await getDaily(env.DB, user.id, counterId, localDate),
    }, 201);
  }

  const deleteMatch = url.pathname.match(/^\/api\/entries\/([^/]+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const id = decodeURIComponent(deleteMatch[1]);

    const existing = await env.DB
      .prepare(`
        SELECT counter_id, local_date
        FROM counter_entries
        WHERE id = ? AND user_id = ?
      `)
      .bind(id, user.id)
      .first();

    if (!existing) {
      return json({ error: "entry_not_found" }, 404);
    }

    await env.DB
      .prepare(`DELETE FROM counter_entries WHERE id = ? AND user_id = ?`)
      .bind(id, user.id)
      .run();

    return json({
      deleted: true,
      daily: await getDaily(env.DB, user.id, existing.counter_id, existing.local_date),
    });
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Unhandled request error", error);
      return json({ error: "internal_error" }, 500);
    }
  },
};
