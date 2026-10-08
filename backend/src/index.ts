import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, withConnection } from "./db";
import { issueToken, requireAuth, requireRole, setSessionCookie, type Role } from "./auth";

const app = express();
app.disable("x-powered-by");
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN?.split(",").map((origin) => origin.trim()) ?? ["http://localhost:3000"],
  credentials: true
}));
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  role: z.enum(["Signer", "Listener"]).default("Signer")
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});
const predictionSchema = z.object({
  landmarks: z.array(z.number().finite()).length(63).refine(
    (values) => values.every((value) => value >= 0 && value <= 1),
    "All landmark values must be normalized to the 0–1 range."
  )
});
const confidenceSchema = z.object({
  sign: z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()),
  confidence: z.number().finite().min(0).max(100)
});

app.get("/health", async (_req, res, next) => {
  try {
    const start = performance.now();
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", dbLatencyMs: Number((performance.now() - start).toFixed(2)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/auth/register", async (req, res, next) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check your details." });
    return;
  }
  try {
    const { name, email, password, role } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    await pool.query(
      "INSERT INTO users (u_id, name, email, password, role) VALUES ($1, $2, $3, $4, $5)",
      [id, name, email, passwordHash, role]
    );
    const user = { id, name, email, role };
    const token = await issueToken(user);
    setSessionCookie(res, token);
    res.status(201).json({ user, token });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/auth/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }
  try {
    const result = await pool.query<{
      u_id: string; name: string; email: string; password: string; role: Role;
    }>("SELECT u_id, name, email, password, role FROM users WHERE email = $1 LIMIT 1", [parsed.data.email]);
    const record = result.rows[0];
    if (!record || !(await bcrypt.compare(parsed.data.password, record.password))) {
      res.status(401).json({ error: "That email and password do not match." });
      return;
    }
    const user = { id: record.u_id, name: record.name, email: record.email, role: record.role };
    const token = await issueToken(user);
    setSessionCookie(res, token);
    res.json({ user, token });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/auth/logout", (_req, res) => {
  res.clearCookie("session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/"
  });
  res.status(204).end();
});

app.get("/api/v1/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

app.get("/api/v1/catalog", async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT gesture_id AS id, gesture_label AS label, sample_count AS "sampleCount" FROM gestures_catalog ORDER BY gesture_label'
    );
    res.json({ gestures: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/sessions", requireAuth, async (req, res, next) => {
  if (req.user?.role === "Listener") {
    res.status(403).json({ error: "Listener accounts can view translations but cannot start a signing session." });
    return;
  }
  try {
    const sessionId = randomUUID();
    const started = await withConnection(async (connection) => {
      await connection.query("BEGIN");
      try {
        const result = await connection.query<{ started_at: Date }>(
          "INSERT INTO sessions (sessions_id, u_id, started_at) VALUES ($1, $2, now()) RETURNING started_at",
          [sessionId, req.user!.id]
        );
        await connection.query("UPDATE users SET total_sessions = total_sessions + 1 WHERE u_id = $1", [req.user!.id]);
        await connection.query("COMMIT");
        return result.rows[0].started_at;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    });
    res.status(201).json({ sessionId, startedAt: started.toISOString() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/sessions/:sessionId/end", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "UPDATE sessions SET ended_at = now() WHERE sessions_id = $1 AND u_id = $2 AND ended_at IS NULL",
      [req.params.sessionId, req.user!.id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Active session not found." });
      return;
    }
    res.json({ ended: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/predict", requireAuth, async (req, res, next) => {
  const parsed = predictionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A frame must contain exactly 63 normalized landmark values." });
    return;
  }
  try {
    if (process.env.ML_MOCK_MODE === "true") {
      res.json({ sign: "HELLO", confidence: 76, model: "demo (not a trained FSL model)" });
      return;
    }
    const mlUrl = process.env.ML_SERVICE_URL;
    if (!mlUrl) throw new Error("ML_SERVICE_URL is not configured.");
    const prediction = await fetch(`${mlUrl.replace(/\/$/, "")}/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ landmarks: parsed.data.landmarks }),
      signal: AbortSignal.timeout(1500)
    });
    if (!prediction.ok) {
      const detail = await prediction.text();
      throw new Error(`Model service returned ${prediction.status}: ${detail.slice(0, 300)}`);
    }
    const result = z.object({
      sign: z.string().min(1).max(32),
      confidence: z.number().finite().min(0).max(100)
    }).parse(await prediction.json());
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/sessions/:sessionId/history", requireAuth, async (req, res, next) => {
  const parsed = confidenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a sign and confidence between 0 and 100." });
    return;
  }
  if (parsed.data.confidence < 70) {
    res.status(422).json({ error: "Predictions below 70% confidence are not saved.", accepted: false });
    return;
  }
  const { sign, confidence } = parsed.data;
  const sessionId = req.params.sessionId;
  const lockKey = createHash("sha256").update(`${req.user!.id}:${sessionId}`).digest("hex");
  try {
    const outcome = await withConnection(async (connection) => {
      await connection.query("BEGIN");
      try {
        await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
        const active = await connection.query(
          "SELECT sessions_id FROM sessions WHERE sessions_id = $1 AND u_id = $2 AND ended_at IS NULL",
          [sessionId, req.user!.id]
        );
        if (active.rowCount === 0) {
          await connection.query("COMMIT");
          return { kind: "inactive" as const };
        }
        const recent = await connection.query<{ sign: string }>(
          `SELECT sign FROM history
           WHERE u_id = $1 AND sessions_id = $2
           ORDER BY detected_at DESC LIMIT 1`,
          [req.user!.id, sessionId]
        );
        if (recent.rows[0]?.sign === sign) {
          const tooSoon = await connection.query(
            "SELECT EXISTS (SELECT 1 FROM history WHERE u_id = $1 AND sessions_id = $2 AND detected_at >= clock_timestamp() - INTERVAL '800 milliseconds') AS recent",
            [req.user!.id, sessionId]
          );
          if (tooSoon.rows[0]?.recent) {
            await connection.query("COMMIT");
            return { kind: "debounced" as const };
          }
        }
        const started = performance.now();
        const historyId = randomUUID();
        await connection.query(
          "INSERT INTO history (history_id, u_id, sessions_id, sign, confidence, detected_at) VALUES ($1, $2, $3, $4, $5, clock_timestamp())",
          [historyId, req.user!.id, sessionId, sign, confidence]
        );
        await connection.query("COMMIT");
        return { kind: "saved" as const, historyId, insertMs: Number((performance.now() - started).toFixed(2)) };
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    });
    if (outcome.kind === "inactive") {
      res.status(409).json({ error: "Start an active session before saving a sign.", accepted: false });
    } else if (outcome.kind === "debounced") {
      res.status(200).json({ accepted: false, reason: "debounced" });
    } else {
      res.status(201).json({ accepted: true, historyId: outcome.historyId, insertMs: outcome.insertMs });
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/sessions/:sessionId/history", requireAuth, async (req, res, next) => {
  try {
    const ownsSession = await pool.query(
      "SELECT sessions_id FROM sessions WHERE sessions_id = $1 AND u_id = $2",
      [req.params.sessionId, req.user!.id]
    );
    if (ownsSession.rowCount === 0 && req.user!.role !== "Admin") {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    const result = await pool.query(
      `SELECT history_id AS id, sign, confidence::float AS confidence, detected_at AS "detectedAt"
       FROM history WHERE sessions_id = $1 ORDER BY detected_at DESC LIMIT 20`,
      [req.params.sessionId]
    );
    res.json({ history: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/sessions", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT sessions_id AS id, started_at AS "startedAt", ended_at AS "endedAt",
              signs_detected AS "signsDetected", unique_signs AS "uniqueSigns"
       FROM sessions WHERE u_id = $1 ORDER BY started_at DESC LIMIT 50`,
      [req.user!.id]
    );
    res.json({ sessions: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/reports", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT sign, count, total_confidence::float AS "totalConfidence",
              avg_confidence::float AS "avgConfidence", first_seen AS "firstSeen", last_seen AS "lastSeen"
       FROM reports WHERE u_id = $1 ORDER BY avg_confidence DESC`,
      [req.user!.id]
    );
    res.json({ reports: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/admin/users", requireAuth, requireRole("Admin"), async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u_id AS id, name, email, role, total_signs AS "totalSigns",
              total_sessions AS "totalSessions", created_at AS "createdAt"
       FROM users ORDER BY created_at DESC LIMIT 500`
    );
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/v1/admin/users/:userId/role", requireAuth, requireRole("Admin"), async (req, res, next) => {
  const roleSchema = z.object({ role: z.enum(["Admin", "Signer", "Listener"]) });
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid user role." });
    return;
  }
  try {
    const result = await pool.query("UPDATE users SET role = $1 WHERE u_id = $2", [
      parsed.data.role, req.params.userId
    ]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json({ updated: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/admin/health", requireAuth, requireRole("Admin"), async (_req, res, next) => {
  try {
    const result = await pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM gestures_catalog");
    res.json({ api: "ok", database: "ok", catalogEntries: Number(result.rows[0]?.count ?? 0) });
  } catch (error) {
    next(error);
  }
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error("API request failed:", error);
  if (res.headersSent) return;
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request." });
    return;
  }
  const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
  res.status(duplicate ? 409 : 500).json({
    error: duplicate ? "An account with that email already exists." : "The service could not complete the request."
  });
};
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`Sign Language Detector API listening on ${port}`));
