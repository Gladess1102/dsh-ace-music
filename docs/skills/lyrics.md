---
name: lyrics
description: How to write lyrics and the style caption for ACE Music's models (v1 and v1.1) — section tags, performance cues, line counts, instrumentals, vocals, length. Read before every create_song.
---

# Lyrics and style for ACE Music

ACE Music renders exactly what you send: `style` becomes the model's caption, `lyrics` is sung as written. Nothing is rewritten for you, so the quality of the song is the quality of these two fields.

## The two models

| | ACE Music v1 (`acemusic-v1`) | ACE Music v1.1 Preview (`acemusic-v1.1`) |
|---|---|---|
| Input | style + lyrics | style + lyrics + optional score (ABC/MIDI) |
| Melody | invents its own | sings your score as written; without one (the score is optional) it writes its own first |
| Length | follows the lyrics; or aim with `duration_sec` (30–600) | follows the score (max 450 s) or the lyrics |
| Extra | — | chords in the score steer the harmony |
| Best for | finished-sounding songs from words | control over melody, covers, mashups |

Each create_song call makes two versions of the same song, for one song price in credits (get_account: `credits_per_create_song`). `duration_sec` is a create_song field for v1 only, with no score.

## Lyrics format

- One sung line per line. Every section starts with a tag on its own line: `[Intro]`, `[Verse 1]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Outro]`…
- Write a whole song, not a sketch: usually verse / chorus / verse / chorus / bridge / chorus / outro, about 4 lines a section. **Too few lines makes the model ramble or end early**; a 2-section lyric gives a ~30-second song.
- Language: write in the language the user wants; the model sings it. The style caption stays in English.
- Keep lines singable: similar length within a section, natural stress, a hook line that repeats in every chorus.
- Words in parentheses are sung (backing vocals, answers): `(oh-oh)`. Never put production notes in parentheses.

### Performance cues in tags (v1 especially)

Put the section's treatment inside its tag, as one bracket: `[Section - concrete change]`. One or two playable directions, not adjectives:

```
[Intro - Muted guitar riff, vinyl crackle]
[Verse 1 - Half-time groove, close breathy vocal]
[Pre-Chorus - Drums build, rising synth arpeggio]
[Chorus - Full band, stacked harmonies, four-on-the-floor]
[Bridge - Drop to piano and voice]
[Outro - Fade on the hook, a cappella last line]
```

Avoid piles of separate tags (`[Chorus][Loud][Emotional]`) — they read as several sections. A cue that applies to the whole song belongs in the style, not in every tag.

### With a score (v1.1)

- The lyric sections must match the score's `% section` comments **in the same order** — same count, same names (verse, chorus, bridge…). Plain tags work best here: `[verse]`, `[chorus]`.
- About **one lyric line per 2 bars** of `V: Vocal` melody, and roughly as many syllables as the phrase has notes. More words than notes get crammed; fewer get stretched.
- A section with no words (intro, solo) still gets its tag, with no lines under it.

### Instrumentals

- v1.1: lyrics with section tags only, no words (or leave lyrics out). The melody goes in `V: Ins` if you send a score.
- v1: section tags with performance cues and no words: `[Intro - Solo cello, slow rubato]` `[Theme - Strings enter, pizzicato bass]`. Never invent sung words for an instrumental section.

## Style caption

One compact English production brief for the same song the lyrics describe:

1. Genre and era, and the role of any fusion ("90s R&B ballad with trap hi-hats").
2. Groove and tempo ("laid-back 85 bpm swing"), key feel if it matters.
3. Instruments **with jobs** ("fingerpicked nylon guitar carries the riff, upright bass walks under the chorus").
4. Vocal: gender and delivery — always say `female vocal` or `male vocal` (or duet, choir) when there is singing.
5. Mix and space ("dry, intimate, close-mic'd; wide reverb only on the bridge").
6. The arc: how it opens, builds, contrasts and ends — the same arc the section tags describe.

Good: `Warm 70s soul, 92 bpm, round Rhodes chords and tight pocket drums, muted guitar stabs on the offbeat, smooth male vocal with gospel harmonies in the chorus, horns enter in the last chorus, analog tape warmth, ends on a held a cappella line.`

Weak: `soul, emotional, beautiful, high quality, male`.

- Describe artist influences as musical traits, never "in the style of <artist>".
- Put real prohibitions in the style as "no …"; don't ban things the user didn't ask to ban.

## Originality

Lyrics come from the user or from you — never from your memory of published songs. If given lines remind you of an existing song, keep only the lines given and write everything else new: don't continue, complete or quote it, nor reuse its title or hook. Avoid stock images ("neon lights", "city lights") unless the user asks for them.

## Before you call create_song

- Sections tagged, a full song's worth of lines, chorus repeated.
- Style says genre, groove, instruments with jobs, vocal gender/delivery, arc.
- With a score: tags match the score's sections in order, ~1 line per 2 bars.
- Confirm with the user: it spends credits (get_account shows how many).