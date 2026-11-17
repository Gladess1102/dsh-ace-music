# Changelog

## 0.2.0 — 2026-11-18

MusicXML support: write the score in MusicXML, deliver it as ABC.

- New `src/musicxml.js`: a dependency-free MusicXML parser plus a converter to ACE's ABC dialect. Handles `<divisions>`/`<duration>` unit maths (falling back to `L:1/32` when a duration does not divide evenly), `<alter>` accidentals, `<chord/>` stacks (top note wins), `<harmony>` chord symbols, `<rehearsal>` section markers, and ties produced when a value has to be split into lengths ACE accepts.
- New `acemusic_score` tool, so a model can turn `.musicxml`/`.xml` text or a local file into the exact ABC `create_song` wants.
- Section markers are emitted as `% <name>` with the same count and order as the lyrics' `[section]` tags — ACE rejects a score otherwise (`score_invalid`, nothing charged).
- `docs/musicxml.md`: the contract, the minimal element subset an agent needs, the conversion table, a pre-flight checklist, and the traps met in practice.
- Tests (`npm test`, 8 cases): octave/accidental mapping, key signatures, unit splitting, XML parsing, the W3C hello-world score, section ordering, lyric extraction, and rejection of non-MusicXML input. Tests live in `test/` and are not shipped in the npm tarball.
- Measured on the reference piece (46 bars, 72 BPM, D minor female choir on `acemusic-v1.1`): section structure, the dynamic arc and an a cappella bridge all survived conversion — the bridge's low band measured 1.4% against 5–9% elsewhere, and the rendered length (157–160 s) matched the score's 153 s.

## 0.1.0 — 2026-11-18

First public release.

- OAuth sign-in for `acemusic.ai/mcp` (dynamic client registration, PKCE S256, loopback callback, authorization-code exchange and refresh-token renewal). Fills the gap left by `@deepseek-ai/dsh-mcp-client`, whose transport only carries static headers and therefore cannot answer the server's `401` + `WWW-Authenticate` challenge.
- Bridges the remote server's ten tools to native DSH tools: `create_song`, `continue_score`, `upload_audio`, `get_skill`, `get_song`, `list_songs`, `download_song`, `show_songs`, `show_upgrade`, `get_account`.
- Management tools: `acemusic_login`, `acemusic_status`, `acemusic_logout`, `acemusic_tools`, plus `acemusic_call` as a raw escape hatch.
- Zero runtime dependencies: a small JSON-RPC client over `fetch` handling both `application/json` and `text/event-stream` responses, with `Mcp-Session-Id` continuity.
- Tokens stored at `~/.dsh/ace-music/credentials.json` (mode `0600`), refreshed automatically; `ACE_MUSIC_PORT` overrides the callback port.
- Bundled ACE Music's four published writing guides (`lyrics`, `cover`, `mashup`, `score-format`) under `docs/skills/`, cached from the official `get_skill` tool. `acemusic_get_skill` now answers from the local copy first, so a model can read the section-tag, parentheses-cue and score rules without a network round trip; the reply names the fallback for fetching the live version.
- Bundle patch (`cordis.patch.yml`) so `dsh plugin add` and the plugin market can install it without extra configuration.
