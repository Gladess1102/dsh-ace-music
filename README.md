# dsh-ace-music

[中文说明](README.zh.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin

**ACE Music's MCP server inside DeepSeek Harness.** Sign in once, then write whole songs — vocals included — and inspect, list or download them without leaving the conversation.

---

## First, what ACE Music actually is

**ACE Music v1 is ranked #1 on Artificial Analysis' AA-Music-Vocal v1.1 leaderboard with 1160 Elo** — ahead of Suno v6 (1144), Suno v6-mini (1132), Mureka V9.5 (1101) and Lyria 3.5 (1050). That leaderboard is a blind listening test: evaluators hear tracks made from the same prompt without knowing which model produced them. It ranks vocal music specifically, not every genre feature — but vocals are exactly where generated music usually gives itself away.

Two models, two different jobs.

**ACE Music v1 — words in, song out.** Give it a style description, your own lyrics, or both. It is built for people who don't write music: describe "warm indie folk with acoustic guitar and a touch of nostalgia" and a finished song comes back. It also reads **performance directions in parentheses** — `(hum softly)`, `(sing with a raspy voice)`, `(add guitar here)` — so you steer not only what is sung but how the vocal and the arrangement develop.

**ACE Music v1.1 Preview — a score you control.** It plans melody and harmony as **ABC notation** before any audio exists. That score fixes the melody, rhythm and chords, and the song is then performed from it: compose first, perform second. Start from a melody you hummed, played, or wrote as MIDI; edit notes and chords; regenerate. The notation is what stays constant. As the model page puts it, each generation is a new performance, so the sound can differ even when the score does not.

Around those two: keyboard-played melodies, humming-to-song, image-to-song, AI cover, mashup, and stem separation, plus MIDI/score export of the main melody and chords.

Published pricing (USD): **Free** — 20 credits/day (about 10 songs), 10 upload minutes, shared queue, no downloads, no commercial rights. **Creator** $7.90/mo — 1,000 credits (about 500 songs), 30 upload minutes, unlimited downloads, priority queue, stem splitter, commercial rights. **Artist** $16.58/mo — 2,500 credits, 60 upload minutes, plus ACE Studio. One generation costs 4 credits and returns two songs. The open ACE-Step 1.5 model is free to run yourself, with no limits.

Live numbers, not marketing copy: `acemusic_get_account` reports your actual balance.

## Before you install: create an ACE Music account

The plugin signs in **as you, with your own account** — it has no key of its own and cannot create accounts.

1. Open <https://acemusic.ai> and register (email or the sign-in providers it offers).
2. Stay signed in in that browser — the plugin opens an authorization page there, and being signed in makes it one click.
3. Optional but useful: generate one song on the website first. You will learn what the style and lyrics fields do, which is exactly what `acemusic_create_song` sends.

Signing in costs nothing. A free account can do everything except download the audio and use results commercially.

## Install

```bash
# from npm
dsh plugin --profile <your-profile> add dsh-ace-music

# or straight from GitHub
dsh plugin --profile <your-profile> add github:Gladess1102/dsh-ace-music
```

Then in DSH: **Plugins** → **Add plugin** → point at the installed package, or restart — the bundle patch activates on load.

## Sign in

```
acemusic_login
```

A browser tab opens on `acemusic.ai` showing *"Connect DeepSeek Harness (ACE Music plugin) to ACE Music"*. Press **Allow**. The token lands in `~/.dsh/ace-music/credentials.json` (mode `0600`, your user only) and every `acemusic_*` tool becomes available.

```
acemusic_status
```

reports the plan, remaining credits, refill time and upload minutes. Tokens last 3600 seconds and refresh automatically; `acemusic_logout` deletes the stored token.

## Tools

Ten tools are bridged from the remote server and registered as `acemusic_*`:

| Tool | What it does |
|---|---|
| `acemusic_create_song` | Style (required) + lyrics + title → a song. Optional ABC/MIDI score on v1.1. |
| `acemusic_continue_score` | Continue a melody from an ABC or MIDI opening (v1.1). |
| `acemusic_upload_audio` | Add a recording or demo to your library; it is transcribed. |
| `acemusic_get_skill` | ACE Music's own writing guides (`cover`, `lyrics`, `mashup`, `score-format`). |
| `acemusic_get_song` | Status (`writing` → `rendering` → `ready` / `failed`), title, style, lyrics, page link. |
| `acemusic_list_songs` | Page through your songs and uploads, newest first. |
| `acemusic_download_song` | Download link (MP3 / WAV / MIDI). Paid plans only. |
| `acemusic_show_songs` | Player card — meaningful in Claude/ChatGPT, plain text in DSH. |
| `acemusic_show_upgrade` | Upgrade card — plain text in DSH. |
| `acemusic_get_account` | Plan, credits, refill schedule, upload minutes, available models. |

Plus five management tools:

| Tool | What it does |
|---|---|
| `acemusic_login` | Start the OAuth flow; returns the authorization link and waits in the background. |
| `acemusic_status` | Sign-in state + live account info. |
| `acemusic_logout` | Delete the stored token. |
| `acemusic_tools` | Re-fetch the remote tool list and register it (idempotent). |
| `acemusic_call` | Escape hatch: call any remote tool by name with raw JSON arguments. |

## Bundled writing guides

The four guides ACE Music publishes through `get_skill` ship inside this package under `docs/skills/`:

| File | Read it before |
|---|---|
| `lyrics.md` | Writing any song — section tags, parentheses cues, line counts, length |
| `cover.md` | Making a cover — how to hand over score and lyrics for another style, key, tempo or language |
| `mashup.md` | Joining two or three songs — one key and tempo, sections taking turns |
| `score-format.md` | Writing or editing ABC notation, and how MIDI is read |

`acemusic_get_skill` returns the local copy first, so the model can consult the rules with no network round trip; the reply says so, and points at `acemusic_call` if you want the live version. Their text belongs to ACE Music (© Timedomain, Inc.) and is cached here verbatim — only this project's code is MIT.

## Why this is a plugin at all

`https://acemusic.ai/mcp` is a Streamable HTTP MCP server that accepts **OAuth only** — an unauthenticated call answers `401` with `WWW-Authenticate: Bearer resource_metadata=...`.

DSH's built-in `@deepseek-ai/dsh-mcp-client` supplies static request headers and nothing else (`createTransport` never passes an `authProvider`), so it cannot answer that challenge. Servers that accept a personal access token — GitHub and friends — work fine, which is why the gap is easy to miss.

This plugin closes it: dynamic client registration, PKCE authorization code flow, a loopback callback on `127.0.0.1`, token exchange and refresh, then the Bearer token bridges the remote tools into native DSH tools. No MCP SDK, no runtime dependencies — a small JSON-RPC client over `fetch`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ACE_MUSIC_PORT` | `8765` | Loopback port for the OAuth callback. Change it if the port is taken. |

State lives in `~/.dsh/ace-music/credentials.json` (`0600`). Delete the file — or call `acemusic_logout` — to unlink the account.

## Privacy and security

- Your password is typed only on `acemusic.ai`; the plugin never sees it. It receives an OAuth token you explicitly granted, scoped to `songs:read songs:create`.
- The token is stored outside the DSH configuration, so it never appears in `cordis.patch.yml`, logs, or a copied profile.
- Network calls go to `acemusic.ai` and nowhere else. No telemetry, no third-party proxy.
- No model weights are downloaded or run locally; generation happens on ACE Music's servers, under your account and your quota.

If the system resolver fails on `acemusic.ai` (some VPN and split-DNS setups do), the client falls back once to resolving through public DNS — the normal path is a plain `fetch`.

## Limits worth knowing

- **Generation is slow.** A song takes tens of seconds to a few minutes. `acemusic_create_song` has a 5-minute tool timeout; a timeout is not a failure — poll `acemusic_get_song` with the id.
- **Every generation spends credits.** 4 credits per request, which returns two songs.
- **The free plan cannot download.** `acemusic_download_song` answers with an upgrade prompt; playback on the song page stays free. Free-tier songs also carry **no commercial-use rights** (upgrading later does not grant them retroactively), and generation runs in a **shared queue** that can be busy.
- **`show_songs` / `show_upgrade`** are designed for clients with card renderers; in DSH they return plain text.
- The remote tool list is fetched at startup when a token exists and can be re-fetched with `acemusic_tools`; if ACE Music adds tools, that call picks them up.

## Development

```bash
npm run check    # syntax check every module
```

| File | Role |
|---|---|
| `index.js` | Plugin entry: `apply(ctx)`, tool registration, remote bridging, local-first guides |
| `src/oauth.js` | Dynamic client registration, PKCE, callback server, token exchange/refresh |
| `src/mcp.js` | Minimal MCP client (initialize / tools/list / tools/call, JSON and SSE) |
| `src/net.js` | `fetch` wrapper with timeout, retry, and a DNS fallback path |
| `cordis.patch.yml` | Bundle patch: one plugin row, `id: ace-music` |
| `docs/skills/` | ACE Music's published writing guides, cached for offline use |

Protocol details are in [docs/DETAIL.md](docs/DETAIL.md).

## License

MIT for the code. The bundled guides under `docs/skills/` are ACE Music's content, cached with attribution. This project is not affiliated with ACE Studio or ACE Music; it is an independent client for their public MCP endpoint.
