# Changelog

## 0.1.0 — 2026-11-18

First public release.

- OAuth sign-in for `acemusic.ai/mcp` (dynamic client registration, PKCE S256, loopback callback, authorization-code exchange and refresh-token renewal). Fills the gap left by `@deepseek-ai/dsh-mcp-client`, whose transport only carries static headers and therefore cannot answer the server's `401` + `WWW-Authenticate` challenge.
- Bridges the remote server's ten tools to native DSH tools: `create_song`, `continue_score`, `upload_audio`, `get_skill`, `get_song`, `list_songs`, `download_song`, `show_songs`, `show_upgrade`, `get_account`.
- Management tools: `acemusic_login`, `acemusic_status`, `acemusic_logout`, `acemusic_tools`, plus `acemusic_call` as a raw escape hatch.
- Zero runtime dependencies: a small JSON-RPC client over `fetch` handling both `application/json` and `text/event-stream` responses, with `Mcp-Session-Id` continuity.
- Tokens stored at `~/.dsh/ace-music/credentials.json` (mode `0600`), refreshed automatically; `ACE_MUSIC_PORT` overrides the callback port.
- Bundled ACE Music's four published writing guides (`lyrics`, `cover`, `mashup`, `score-format`) under `docs/skills/`, cached from the official `get_skill` tool. `acemusic_get_skill` now answers from the local copy first, so a model can read the section-tag, parentheses-cue and score rules without a network round trip; the reply names the fallback for fetching the live version.
- Bundle patch (`cordis.patch.yml`) so `dsh plugin add` and the plugin market can install it without extra configuration.
