import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { config } from "../config.js";
import {
  SEVERITIES,
  createIncidentThread,
  type Severity,
} from "../services/discord.js";

const SECRET_HEADER = "x-webhook-secret";
const DEFAULT_SEVERITY: Severity = "medium";

export const webhookRouter = Router();

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function secretsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

function extractSecret(req: Request, body: Record<string, unknown>): string | null {
  const header = req.header(SECRET_HEADER);
  if (header) return header;
  return typeof body.secret === "string" ? body.secret : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseSeverity(value: unknown): Severity | null {
  if (value === undefined || value === null) return DEFAULT_SEVERITY;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (SEVERITIES as readonly string[]).includes(normalized)
    ? (normalized as Severity)
    : null;
}

webhookRouter.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const secret = extractSecret(req, body);
  if (!secret || !secretsMatch(secret, config.webhookSecret)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const title = nonEmptyString(body.title);
  const message = nonEmptyString(body.message);
  if (!title || !message) {
    res.status(400).json({ error: "title and message are required non-empty strings" });
    return;
  }

  const severity = parseSeverity(body.severity);
  if (!severity) {
    res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(", ")}` });
    return;
  }

  try {
    const incident = await createIncidentThread(title, message, severity);
    res.status(201).json(incident);
  } catch (error) {
    console.error("[webhook] failed to create incident thread:", error);
    res.status(502).json({ error: "failed to create discord incident thread" });
  }
});
