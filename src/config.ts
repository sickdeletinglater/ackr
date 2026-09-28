import "dotenv/config";

const DEFAULT_PORT = 3000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid PORT: ${raw}`);
  }
  return port;
}

export const config = {
  port: parsePort(process.env.PORT),
  discordToken: required("DISCORD_TOKEN"),
  incidentChannelId: required("DISCORD_INCIDENT_CHANNEL_ID"),
  webhookSecret: required("WEBHOOK_SECRET"),
} as const;
