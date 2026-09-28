# ackr

ackr is a small node.js + typescript service. it accepts a json webhook, validates it, and opens a public discord thread in your incident channel with a rich embed and two buttons: **acknowledge** and **resolve**. no database, all state lives in the discord message.

## how it works

```
alert source  --POST /webhook-->  ackr  --discord.js-->  #incidents
                                                          └─ thread: 🔴 db down
                                                             └─ embed + [acknowledge] [resolve]
```

1. a script, sentry alert rule, or ci job posts `title`, `message`, and an optional `severity`
2. ackr checks the shared secret and validates the payload
3. ackr creates a public thread in the configured channel and posts the embed
4. anyone in the thread clicks a button. the embed status updates with who did it
5. resolve turns the embed green and disables both buttons

## stack

- node.js 20+
- typescript (strict)
- express 4
- discord.js 14

## setup

```bash
npm install
cp .env.example .env
npm run dev
```

### discord bot

1. create an application at the discord developer portal and add a bot
2. copy the bot token into `DISCORD_TOKEN`
3. invite the bot with the `bot` scope and these permissions: view channel, send messages, create public threads, send messages in threads
4. enable developer mode in discord, right click your incident channel, copy its id into `DISCORD_INCIDENT_CHANNEL_ID`

only the `Guilds` intent is used, so no privileged intents are needed. the channel must be a regular text channel.

### environment

| variable | required | description |
| --- | --- | --- |
| `PORT` | no | http port, defaults to `3000` |
| `DISCORD_TOKEN` | yes | bot token |
| `DISCORD_INCIDENT_CHANNEL_ID` | yes | text channel where threads are created |
| `WEBHOOK_SECRET` | yes | shared secret callers must send |

the service refuses to start if a required variable is missing.

## api

### `POST /webhook`

auth: send the secret in the `x-webhook-secret` header, or as a `secret` field in the json body.

| field | type | required | notes |
| --- | --- | --- | --- |
| `title` | string | yes | thread name and embed title |
| `message` | string | yes | embed description |
| `severity` | string | no | `low`, `medium`, `high`, `critical`. defaults to `medium` |

```bash
curl -X POST http://localhost:3000/webhook \
  -H "content-type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{"title":"db down","message":"primary not responding","severity":"critical"}'
```

response `201`:

```json
{
  "threadId": "123456789012345678",
  "messageId": "123456789012345679",
  "url": "https://discord.com/channels/..."
}
```

| status | meaning |
| --- | --- |
| `201` | thread created |
| `400` | missing title or message, or invalid severity or json |
| `401` | missing or wrong secret |
| `502` | discord call failed |

### `GET /health`

returns `{"status":"ok"}`.

## severity styles

| severity | color |
| --- | --- |
| low | 🔵 blue |
| medium | 🟡 yellow |
| high | 🟠 orange |
| critical | 🔴 red |

## scripts

| command | what it does |
| --- | --- |
| `npm run dev` | run with tsx in watch mode |
| `npm run build` | compile to `dist/` |
| `npm start` | run the compiled build |
| `npm run typecheck` | type check without emitting |

## project structure

```
src/
  config.ts             env loading and validation
  server.ts             express setup, health check, graceful shutdown
  routes/webhook.ts     secret check, payload validation, calls discord service
  services/discord.ts   client login, createIncidentThread, button handlers
```

## security notes

- the secret is compared in constant time
- request bodies are capped at 100kb
- use https in front of the service, the secret travels in a header
- anyone who can see the thread can press the buttons

## limitations

- one incident channel per instance
- no dedup, the same alert posted twice opens two threads
- no built-in adapters for github or sentry payloads. their native webhook formats are different, so map them to `title`, `message`, `severity` in a small relay, a github action, or a sentry integration step
- button state is stored in the message embed only, so it is not queryable
