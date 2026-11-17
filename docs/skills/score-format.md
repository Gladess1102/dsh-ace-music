---
name: score-format
description: The ABC dialect ACE Music v1.1 sings (and continue_score writes), how MIDI is read, and how to edit a score — transposing, tempo, sections, pickups. Read before writing or changing any score.
---

# ACE Music score format (ABC and MIDI)

`create_song` (with `acemusic-v1.1`) and `continue_score` take a score as ABC text in the song model's own dialect, or a MIDI file. A score that strays from this format is turned back before anything is charged, with the problems listed.

## Template

```
X:1
T:<title>
M:4/4
L:1/16
Q:1/4=96
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% intro
V: Vocal
Z4|
V: Ins
"C"e4g4c'4g4|"Am"a8g8|"F"f4a4c'4a4|"G"g16|
% verse
V: Vocal
"C"E4G4c4G4|"Am"A8G8|"F"F4A4c4A4|"G"G8z8|
V: Ins
Z4|
% chorus
V: Vocal
"F"c4c4d4c4|"G"B8G8|"C"c4e4g4e4|"C"c16|
V: Ins
Z4|
```

Leave out the `V: Ins` declaration and blocks entirely when there is no instrumental line.

## Rules

- **Headers** `X T M L Q K`, in that order, voices declared before `K:`. `L:1/16` (use `L:1/32` only for very fine rhythms). Tempo as `Q:1/4=<bpm>`.
- **Voices**: only `Vocal` (the sung melody) and `Ins` (an instrumental melody line). Nothing else — no `V:1`, `V:Piano`, `V:Bass`. A song with words: melody in `Vocal`. An instrumental: melody in `Ins`, and either no `Vocal` voice or `Z` rests in it.
- **Sections**: one `% <name>` comment per section (`intro`, `verse`, `pre-chorus`, `chorus`, `bridge`, `solo`, `outro`…), then its voice blocks. With both voices, every section has a `V: Vocal` block then a `V: Ins` block over the same number of bars. The lyrics' `[section]` tags follow these, in the same order.
- **Bars** add up exactly to the meter: in 4/4 at L:1/16 a bar is 16 units. Note lengths in units of L: 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48. Ties: `c8-c4`.
- **Rests**: `z4` (a rest of 4 units), `Z` a whole bar, `Z4` four whole bars.
- **No repeat signs** (`|:` `:|`) and no final `|]` — write repeated music out in full.
- **Chords**: in double quotes before the note they start on. Supported: major, `m`, `7`, `maj7`, `m7`, `dim`, `dim7`, `aug`, `m7b5`, `sus2`, `sus4`, `6`, `m6`, `7sus4`, `m(maj7)`, with an optional `/bass`: `"C"`, `"Am7"`, `"F/A"`, `"Bbmaj7"`. Chords make v1.1 follow your harmony; without them it chooses its own.
- **Pitch**: `C,` (low) … `C D E F G A B` … `c d e f g a b` … `c'` (high). Accidentals `^` sharp, `_` flat, `=` natural, for that note only (the key signature applies otherwise).
- **Length**: at least 4 notes; at most 450 seconds of music (bars × beats ÷ bpm).
- **Phrasing**: about one lyric line per 2 bars of `Vocal`, and about as many notes as the line has syllables.

## Common edits

- **Transpose** by n semitones: move every note and every chord root and bass by n, and change `K:`. Keep the vocal in a singable range — roughly an octave and a half; move a whole section by an octave if it ends up too high or low.
- **Tempo**: change `Q:` only; the bars stay. For a big change (70 ↔ 140 bpm) halve or double every note length instead (half-time / double-time) so the feel survives.
- **Reorder / repeat / drop sections**: move whole `% section` blocks (with all their voices) and keep the lyric tags in the same order.
- **Intro or solo**: a section where `V: Vocal` rests (`Z4|`) and `V: Ins` plays.
- **Pickup** (a line starting before the downbeat): its notes sit at the end of the previous bar — keep them with the line when you move sections.

## MIDI

Send a standard `.mid` as `midi_base64` (≤2 MB). It is turned into this ABC by rule: the track carrying lyrics if there is one, otherwise the highest single-note melodic track, becomes the melody; the tempo, meter and key come from the file. For control over which line is sung (or to add chords), convert it yourself and send ABC.

## continue_score

Sends your opening to the music model, which writes it on — a stretch per call (often 20–40 seconds), the opening kept. Each call costs 1 credit (returned if it fails), so continue only what you will use. Pass the whole song's lyrics so it writes toward their sections; call it again on its result to go further. Then check bars and sections against these rules and render with create_song.