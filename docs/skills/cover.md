---
name: cover
description: Make a cover with ACE Music — a new performance of a song's melody in another style, key, tempo or language, from a song in the user's library, a MIDI or an ABC score. Read when the user asks for a cover, a remake, a new version or "this song but as…".
---

# Cover

A cover keeps a song's **melody** and gives it a new performance: another genre, groove, key, tempo, singer, language or words. On ACE Music that means: take the song's score, change it, write the style (and lyrics), and render it with `acemusic-v1.1`. It is a new recording sung by the model — never a copy of the original's audio or voice.

## 1. Get the source

`create_song` never takes audio — only style, lyrics and a score (ABC or MIDI). Audio is only a way to get a score: you turn it into the final score yourself.

| Source | How |
|---|---|
| An audio file the user has | `upload_audio` — a one-time link you send the file to (`curl -T file "<upload_url>"`), or `url` for a direct https link to the file. It is transcribed into a score and its lyrics are heard: poll `get_song` with `include_score: true` until ready → `score_abc`, `lyrics`. Uploads count against the plan's upload minutes. |
| A song already in their ACE Music library (uploaded on the site) | `list_songs` — uploads come back with `kind: "upload"` (a field to read, not a filter) — then `get_song` with `include_score: true`. |
| A song made earlier with v1.1 | Same: `get_song` with `include_score: true`. (v1 songs have no score.) |
| A MIDI file or ABC from the user | Use it directly (`score.midi_base64` or `score.abc`). |

A streaming page (YouTube, Spotify…) is not an audio file: ask the user for the file itself. Only upload audio the user has the right to use.

## 2. Read it

From the ABC note: key (`K:`), tempo (`Q:`), meter (`M:`), the sections (`% verse`, `% chorus`… and how many bars each), where the melody is (`V: Vocal` for a sung song), the chords, and the vocal range (lowest and highest notes). Match the heard lyrics to the sections.

## 3. Decide the cover (with the user)

Keep the melody recognisable; change what the user asked for. Typical decisions:

- **Style** — the new genre, instruments with jobs, vocal gender and delivery (see the `lyrics` skill).
- **Key** — transpose for the new singer: a female vocal often sits 3–5 semitones above a male one. Shift every note and chord, update `K:`.
- **Tempo** — change `Q:`; for a big genre change use half-time or double-time (see `score-format`).
- **Harmony** — re-harmonise only where the melody still fits (a jazz cover: `"C"` → `"Cmaj7"`, `"G"` → `"G7"`); keep the chords otherwise.
- **Structure** — shorten (drop a verse), extend (repeat the final chorus), add an intro or outro where `V: Vocal` rests and `V: Ins` plays. Stay under 450 seconds.
- **Words** —
  - same lyrics: use the heard lyrics as they are (fix only obvious mishearings with the user);
  - new lyrics or a translation: write each section with **the same number of lines and about the same syllables per line** as the original, so the words fit the notes;
  - instrumental cover: move the melody to `V: Ins`, lyrics as section tags only.
- Lyrics only from the source or the user — never quote a published song from memory.

## 4. Render

```
create_song {
  model: "acemusic-v1.1",
  title: "<Song> (Bossa Nova Cover)",
  style: "<new production brief>",
  lyrics: "<sections in the same order as the score>",
  score: { abc: "<edited score>" }
}
```

Check before sending: the lyric tags match the score's `% sections` in order; every bar adds up; voices are only Vocal / Ins. Confirm the credit cost with the user. Poll `get_song`; if one version is clearly better, say which.

## Tips

- If the source score is messy (a rough transcription), tidy it first: quantise jittery rhythms to 1/8 and 1/4 notes, drop stray tiny notes, keep the hook exact.
- A chord-rich score gives v1.1 the most to work with; a melody-only score lets it re-harmonise freely.
- For a cover that only changes the sound (same key, tempo and words), sending the score as it is with a new style is enough.