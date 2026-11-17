<!-- Thanks for contributing! Quick checklist / 提交前快速自查 -->

- [x] I added **one file** at `data/plugins/Gladess1102__dsh-ace-music.yml`
- [x] My repo's `package.json` declares **`dsh.bundle`** (not just `dsh.client`)
- [x] My repo is at least **1 day old**
- [x] `category` is `voice`
- [x] Description states what the plugin does, no superlatives
- [x] My repo has the `dsh-plugin` topic

---

Adds `data/plugins/Gladess1102__dsh-ace-music.yml`.

**What it does.** ACE Music's MCP server inside DSH. The plugin signs in with the user's own ACE Music account over OAuth — dynamic client registration, PKCE, a loopback callback on `127.0.0.1:8765`, token exchange and automatic refresh — and then bridges the remote server's ten tools to native `acemusic_*` tools: write a song from a style and lyrics, continue a melody from an ABC or MIDI opening, upload audio for transcription, poll render status, page the library, download on paid plans, read the account's credits.

**Why it has to be a plugin.** `acemusic.ai/mcp` accepts OAuth only; an unauthenticated call answers `401` with `WWW-Authenticate: Bearer resource_metadata=...`. DSH's `@deepseek-ai/dsh-mcp-client` builds its transport with static request headers only (`createTransport` never passes an `authProvider`), so it cannot answer that challenge. The plugin owns the authorization flow and hands the MCP client a Bearer token.

**Verification against the checklist**

- `package.json` declares `dsh.bundle.patch` → `./cordis.patch.yml`, and that file contains the matching row (`id: ace-music`, `name: dsh-ace-music`)
- repo carries the `dsh-plugin` topic
- zero runtime dependencies; the remote client is a small JSON-RPC implementation over `fetch`, so nothing is installed at activation
- credentials are written to `~/.dsh/ace-music/credentials.json` with mode `0600`, outside the DSH configuration, so no secret reaches `cordis.patch.yml`
- tested against ACE Music on 2026-11-17: sign-in, `get_account`, `list_songs`, and a full `create_song` → `get_song` cycle returning two rendered versions

**Scope and limits** stated in the README: generation spends the account's own credits (free tier 20/day, 4 per song), downloads require a paid ACE Music plan, and `show_songs` / `show_upgrade` return plain text in DSH because DSH has no card renderer for them.
