import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import { webhookRouter } from "./routes/webhook.js";
import { shutdownDiscord, startDiscord } from "./services/discord.js";

const JSON_BODY_LIMIT = "100kb";

async function main(): Promise<void> {
  await startDiscord();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/webhook", webhookRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (error as { status?: number }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: "invalid request" });
      return;
    }
    console.error("[server] unhandled error:", error);
    res.status(500).json({ error: "internal server error" });
  });

  const server = app.listen(config.port, () => {
    console.log(`[server] listening on port ${config.port}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => {
      shutdownDiscord()
        .catch((error) => console.error("[server] discord shutdown failed:", error))
        .finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[server] fatal startup error:", error);
  process.exit(1);
});
