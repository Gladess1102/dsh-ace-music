---
name: mashup
description: Make a mashup with ACE Music — two or three songs joined into one, their sections taking turns in one key and tempo. Read when the user asks to mash up, blend or combine songs.
---

# Mashup

An ACE Music mashup is **one new song made of sections from two or three songs, taking turns** — song A's verse, song B's chorus, A's verse again, B's chorus… — all in one key and one tempo, sung by one performance. It is not two tracks layered on top of each other: one melody sounds at a time.

## 1. Get the sources

`create_song` never takes audio — only style, lyrics and a score (ABC or MIDI). The songs' audio is only a way to get their scores: you join them into the final score yourself.

Each song needs a score: an audio file added with `upload_audio` (transcribed into a score and lyrics), an upload or a v1.1 song already in the user's library (`list_songs`), or MIDI / ABC from the user. Get each score with `get_song` and `include_score: true` → `score_abc` and `lyrics`. Uploads count against the plan's upload minutes.

## 2. Read them side by side

For each song: key, tempo, meter, sections with their bar counts and lyric lines, vocal range, and the strongest hook (usually the chorus).

Same meter is required — don't mix 3/4 and 4/4 sections.

## 3. Plan the order (with the user)

- Pick what each song is best at: often one song's verses with the other's chorus.
- Alternate so both are heard: e.g. `A intro → A verse → B chorus → A verse → B chorus → A bridge → B chorus (final)`.
- Join where the music meets naturally: end a section on a full phrase, start the next on its downbeat (or its pickup).
- 2–3 minutes is plenty; never over 450 seconds.

## 4. Put them in one key and tempo

- **Key**: choose one target key (often the song with the main hook keeps its key). Transpose every section of the other song by the semitones between the keys — notes and chords — choosing the octave that keeps the vocal near the first song's range. A relative minor/major pair (C / Am) needs no transposing.
- **Tempo**: one `Q:` for the whole song, usually the main song's. If the other is about half or double, halve or double its note lengths (half-time / double-time) instead of slowing it; otherwise keep its bars as they are under the new `Q:`.

## 5. Write the joined score

One ABC: the headers once (`X T M L Q`, voices, `K:` the target key), then the chosen sections in order, each with its `% name` and its own `V: Vocal` (and `V: Ins`) blocks. Rename repeated sections clearly (`% verse`, `% chorus`, `% verse 2`). Check every bar adds up (`score-format` skill).

## 6. Lyrics follow their sections

Each section keeps the lines that belong to its notes, in the score's order, with matching tags. If the user wants new words, write per section with the same line count and syllables as the original section. Lyrics only from the sources or the user.

## 7. Style and render

Write one style that blends both songs into a single performance (one genre, one vocal) — see the `lyrics` skill. Then:

```
create_song {
  model: "acemusic-v1.1",
  title: "<A> × <B>",
  style: "<one production brief for the blend>",
  lyrics: "<sections in score order>",
  score: { abc: "<joined score>" }
}
```

Confirm the credit cost with the user first, then poll `get_song`.