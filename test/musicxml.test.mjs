import test from 'node:test'
import assert from 'node:assert/strict'

import { abcPitch, abcKey, splitUnits, musicxmlToAbc, parseXml } from '../src/musicxml.js'

const HELLO = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`

/** divisions=4 → 四分音符 4 ticks；一段两小节，含歌词、和弦与段落标记。 */
const RICH = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Test Piece</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Vocal</part-name></score-part>
    <score-part id="P2"><part-name>Ins</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>-1</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><rehearsal>verse</rehearsal></direction-type></direction>
      <harmony><root><root-step>D</root-step></root><kind text="minor">minor</kind></harmony>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type>
        <lyric><text>hel</text></lyric></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type>
        <lyric><text>lo</text></lyric></note>
      <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <direction><direction-type><rehearsal>chorus</rehearsal></direction-type></direction>
      <note><rest/><duration>16</duration><type>whole</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1"><note><rest/><duration>16</duration><type>whole</type></note></measure>
    <measure number="2"><note><rest/><duration>16</duration><type>whole</type></note></measure>
  </part>
</score-partwise>`

test('abcPitch maps octaves and accidentals into the ABC letter range', () => {
  assert.equal(abcPitch('C', 0, 4), 'c', 'middle C is lowercase')
  assert.equal(abcPitch('C', 0, 5), "c'")
  assert.equal(abcPitch('C', 0, 6), "c''")
  assert.equal(abcPitch('C', 0, 3), 'C')
  assert.equal(abcPitch('C', 0, 2), 'C,')
  assert.equal(abcPitch('B', -1, 4), '_b', 'flat')
  assert.equal(abcPitch('C', 1, 4), '^c', 'sharp')
  assert.equal(abcPitch('F', 2, 4), '^^f', 'double sharp')
  assert.equal(abcPitch('H', 0, 4), null, 'unknown step is rejected')
})

test('abcKey covers both accidental directions and minor mode', () => {
  assert.equal(abcKey(0), 'C')
  assert.equal(abcKey(-1, 'minor'), 'Dm')
  assert.equal(abcKey(2), 'D')
  assert.equal(abcKey(-3), 'Eb')
  assert.equal(abcKey(99), 'C#', 'clamped to seven sharps')
})

test('splitUnits produces only lengths ACE accepts, summing exactly', () => {
  for (const n of [1, 2, 3, 4, 5, 7, 9, 11, 13, 17, 23, 31]) {
    const parts = splitUnits(n)
    assert.equal(parts.reduce((a, b) => a + b, 0), n, `sum for ${n}`)
    for (const p of parts) assert.ok([1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48].includes(p), `${p} not allowed`)
  }
  assert.deepEqual(splitUnits(16), [16], 'exact values stay whole')
})

test('parseXml keeps nesting, text and attributes', () => {
  const tree = parseXml('<a x="1"><b>hi</b><c/></a>')
  const a = tree.children[0]
  assert.equal(a.name, 'a')
  assert.equal(a.attrs.x, '1')
  assert.equal(a.children.length, 2)
  assert.equal(a.children[0].text, 'hi')
})

test('musicxmlToAbc renders the W3C hello world as one full bar', () => {
  const out = musicxmlToAbc(HELLO)
  assert.equal(out.bars, 1)
  assert.match(out.abc, /L:1\/16/)
  assert.match(out.abc, /M:4\/4/)
  assert.match(out.abc, /c16\|/, 'a whole note is sixteen sixteenths in 4/4')
  assert.deepEqual(out.warnings, [], 'a clean score raises no warnings')
})

test('musicxmlToAbc splits voice from instrumental line and keeps sections ordered', () => {
  const out = musicxmlToAbc(RICH)
  assert.equal(out.voices, 2)
  assert.match(out.abc, /V: Vocal/)
  assert.match(out.abc, /V: Ins/)
  assert.deepEqual(out.sections, ['verse', 'chorus'], 'sections in score order')
  assert.match(out.abc, /% verse/)
  assert.match(out.abc, /% chorus/)
  assert.match(out.abc, /"Dm"/, 'harmony becomes an ABC chord symbol')
  assert.match(out.abc, /_b4/, 'flat from <alter>')
})

test('musicxmlToAbc writes lyrics and closes every bar to the meter', () => {
  const out = musicxmlToAbc(RICH)
  assert.deepEqual(out.lyrics.slice(0, 2), ['hel', 'lo'])

  // ABC 按段落分块：每段一组 V: Vocal / V: Ins，所以逐段检查
  const verse = out.abc.split('% verse')[1]?.split('% chorus')[0] ?? ''
  assert.match(verse, /V: Vocal/, 'verse carries a vocal block')
  assert.match(verse, /V: Ins/, 'verse carries an instrumental block')
  assert.match(verse, /\|/, 'bars are closed with a barline')

  // 每个小节末尾都有 |，且没有残留的空拍
  const vocalBars = verse.split('V: Vocal')[1]?.split('V: Ins')[0] ?? ''
  assert.equal((vocalBars.match(/\|/g) ?? []).length, 1, 'one bar in this verse section')
  assert.doesNotMatch(vocalBars, /\d\|\z16\|/, 'no bar is both filled and padded')
})

test('musicxmlToAbc rejects a document that is not MusicXML', () => {
  assert.throws(() => musicxmlToAbc('<html><body>nope</body></html>'), /不是 MusicXML/)
})
