import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ThreadAutoArchiveDuration,
  type ButtonInteraction,
} from "discord.js";
import { config } from "../config.js";

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

type IncidentState = "open" | "acknowledged" | "resolved";

export interface IncidentThread {
  threadId: string;
  messageId: string;
  url: string;
}

const ACK_BUTTON_ID = "incident:ack";
const RESOLVE_BUTTON_ID = "incident:resolve";
const STATUS_FIELD_NAME = "Status";
const THREAD_NAME_MAX_LENGTH = 100;
const EMBED_DESCRIPTION_MAX_LENGTH = 4096;
const RESOLVED_COLOR = 0x2ecc71;
const THREAD_AUTO_ARCHIVE = ThreadAutoArchiveDuration.OneDay;

const SEVERITY_STYLES: Record<Severity, { color: number; emoji: string }> = {
  low: { color: 0x3498db, emoji: "🔵" },
  medium: { color: 0xf1c40f, emoji: "🟡" },
  high: { color: 0xe67e22, emoji: "🟠" },
  critical: { color: 0xe74c3c, emoji: "🔴" },
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function buildButtons(state: IncidentState): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ACK_BUTTON_ID)
      .setLabel("Acknowledge")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(state !== "open"),
    new ButtonBuilder()
      .setCustomId(RESOLVE_BUTTON_ID)
      .setLabel("Resolve")
      .setStyle(ButtonStyle.Success)
      .setDisabled(state === "resolved"),
  );
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const isAck = interaction.customId === ACK_BUTTON_ID;
  const isResolve = interaction.customId === RESOLVE_BUTTON_ID;
  if (!isAck && !isResolve) return;

  const source = interaction.message.embeds[0];
  if (!source) {
    await interaction.reply({
      content: "this incident message has no embed to update.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const state: IncidentState = isResolve ? "resolved" : "acknowledged";
  const label = isResolve ? "Resolved" : "Acknowledged";

  const fields = source.fields.map((field) =>
    field.name === STATUS_FIELD_NAME
      ? { ...field, value: `${label} by <@${interaction.user.id}>` }
      : field,
  );

  const embed = EmbedBuilder.from(source).setFields(fields);
  if (isResolve) embed.setColor(RESOLVED_COLOR);

  await interaction.update({
    embeds: [embed],
    components: [buildButtons(state)],
  });
}

export async function startDiscord(): Promise<void> {
  client.on(Events.Error, (error) => {
    console.error("[discord] client error:", error);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isButton()) return;
    handleButton(interaction).catch((error) => {
      console.error("[discord] button handler failed:", error);
    });
  });

  const ready = new Promise<void>((resolve) => {
    client.once(Events.ClientReady, () => resolve());
  });

  await client.login(config.discordToken);
  await ready;
  console.log(`[discord] logged in as ${client.user?.tag ?? "unknown"}`);
}

export async function shutdownDiscord(): Promise<void> {
  await client.destroy();
}

export async function createIncidentThread(
  title: string,
  message: string,
  severity: Severity,
): Promise<IncidentThread> {
  const channel = await client.channels.fetch(config.incidentChannelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(
      `channel ${config.incidentChannelId} is not an accessible guild text channel`,
    );
  }

  const style = SEVERITY_STYLES[severity];

  const thread = await channel.threads.create({
    name: truncate(`${style.emoji} ${title}`, THREAD_NAME_MAX_LENGTH),
    autoArchiveDuration: THREAD_AUTO_ARCHIVE,
    type: ChannelType.PublicThread,
    reason: "incident opened via webhook",
  });

  const embed = new EmbedBuilder()
    .setTitle(truncate(title, 256))
    .setDescription(truncate(message, EMBED_DESCRIPTION_MAX_LENGTH))
    .setColor(style.color)
    .addFields(
      { name: "Severity", value: severity.toUpperCase(), inline: true },
      { name: STATUS_FIELD_NAME, value: "Open", inline: true },
    )
    .setFooter({ text: "ackr" })
    .setTimestamp();

  const sent = await thread.send({
    embeds: [embed],
    components: [buildButtons("open")],
  });

  return { threadId: thread.id, messageId: sent.id, url: thread.url };
}
