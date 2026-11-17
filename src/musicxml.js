/**
 * MusicXML → ACE Music ABC。
 *
 * 为什么需要这一层：ACE Music 的**网页端**接受 .musicxml / .mxl / .mid（Idea → Sing
 * sheet music），但它的 **MCP 工具**只收两种东西——`score.abc`（ACE 自己的 ABC 方言）
 * 或 `midi_base64`。所以 MusicXML 只能当创作层，落地前必须转换。
 *
 * 而 MusicXML 恰好是给模型写谱最合适的格式：结构规整、可校验、可逐小节增量生成，
 * 一个文件同时含音高、时值、歌词、和弦、力度与速度。这个模块把那份"完整"压到 ACE
 * 能唱的"窄"：单声部旋律 + 和弦符号。
 *
 * 映射取舍（与 ACE 的 ABC 方言对齐，见 docs/skills/score-format.md）：
 * - 只输出 `V: Vocal`（有歌词的旋律）与 `V: Ins`（器乐旋律）两条线。
 * - `<chord/>` 堆叠取**最高音**当旋律；和声用 `<harmony>` 的 `"C"` 符号表达。
 * - 时值换算成 L:1/16 的单位（`duration * 4 / divisions`），除不尽退到 L:1/32。
 * - ACE 只接受 1/2/3/4/6/8/12/16/24/32/48，其他长度拆成可接受值之和并以 `-` 相连，
 *   保证小节仍然精确满。
 * - 段落不输出 `%` 标记：ACE 的段落由歌词里的 `[section]` 标签决定，谱只需连续。
 */

const ABC_UNITS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48]

/* ────────────────────────────── 极简 XML 解析 ────────────────────────────── */

export function parseXml(source) {
  const root = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const decode = (s) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')

  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/([A-Za-z_:][\w.:-]*)\s*>|<([A-Za-z_:][\w.:-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(source)) !== null) {
    const [, cdata, closeName, openName, attrText, selfClose, text] = m
    const top = stack[stack.length - 1]
    if (cdata !== undefined) { top.text += cdata; continue }
    if (text !== undefined) { const t = decode(text).trim(); if (t) top.text += t; continue }
    if (closeName) { if (stack.length > 1 && top.name === closeName) stack.pop(); continue }
    if (openName) {
      const attrs = {}
      if (attrText) {
        const a = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
        let mm
        while ((mm = a.exec(attrText)) !== null) attrs[mm[1]] = decode(mm[2] ?? mm[3] ?? '')
      }
      const node = { name: openName, attrs, children: [], text: '' }
      top.children.push(node)
      if (!selfClose) stack.push(node)
    }
  }
  return root
}

const kids = (node, name) => (node?.children ?? []).filter((c) => c.name === name)
const kid = (node, name) => kids(node, name)[0]
const value = (node, name) => {
  const found = kid(node, name)
  return found ? (found.text || '').trim() : ''
}
function findDeep(node, name) {
  if (!node) return undefined
  for (const c of node.children ?? []) {
    if (c.name === name) return c
    const hit = findDeep(c, name)
    if (hit) return hit
  }
  return undefined
}

/* ──────────────────────────────── 音乐换算 ──────────────────────────────── */

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

/** MusicXML 音高 → ABC 音名（octave 4 是中央 C，写作小写 c）。 */
export function abcPitch(step, alter = 0, octave = 4) {
  const i = STEPS.indexOf(step)
  if (i < 0) return null
  const acc = alter >= 2 ? '^^' : alter === 1 ? '^' : alter === -1 ? '_' : alter <= -2 ? '__' : ''
  const letter = STEPS[i]
  if (octave >= 4) return acc + letter.toLowerCase() + "'".repeat(octave - 4)
  return acc + letter.toUpperCase() + ','.repeat(Math.max(0, 3 - octave))
}

/** ABC 音名对应的可比较音高数值，用于和弦取顶音。 */
function pitchRank(step, alter, octave) {
  const i = STEPS.indexOf(step)
  if (i < 0) return -Infinity
  return octave * 12 + i + (alter || 0)
}

/** 拆分单位为 ACE 接受的长度集合。 */
export function splitUnits(units) {
  if (units <= 0) return []
  if (ABC_UNITS.includes(units)) return [units]
  const out = []
  let left = units
  while (left > 0) {
    const pick = [...ABC_UNITS].reverse().find((n) => n <= left)
    if (!pick) break
    out.push(pick)
    left -= pick
  }
  if (left > 0) out[out.length - 1] += left
  return out
}

const MAJOR_SHARP = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
const MINOR_SHARP = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#']
const MAJOR_FLAT = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']
const MINOR_FLAT = ['A', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab']

export function abcKey(fifths, mode) {
  const n = Math.max(-7, Math.min(7, Number(fifths) || 0))
  const minor = typeof mode === 'string' && /min/i.test(mode)
  if (n >= 0) return (minor ? MINOR_SHARP : MAJOR_SHARP)[n] + (minor ? 'm' : '')
  return (minor ? MINOR_FLAT : MAJOR_FLAT)[-n] + (minor ? 'm' : '')
}

/** `<harmony>` → ABC 和弦符号。 */
const HARMONY_KIND = {
  'major': '', 'minor': 'm', 'dominant': '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
  'diminished': 'dim', 'diminished-seventh': 'dim7', 'augmented': 'aug',
  'half-diminished': 'm7b5', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4',
  'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-seventh': '7',
  'major-minor': 'm(maj7)', 'power': '5',
}
const ALTER_NAME = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' }

export function abcHarmony(harmonyNode) {
  const root = kid(harmonyNode, 'root')
  if (!root) return null
  const step = value(root, 'root-step')
  const alter = value(root, 'root-alter') || '0'
  const kindNode = kid(harmonyNode, 'kind')
  const kind = kindNode?.attrs?.text ?? (kindNode?.text ?? '').trim()
  const suffix = HARMONY_KIND[kind] ?? ''
  let symbol = `${step}${ALTER_NAME[alter] ?? ''}${suffix}`
  const bass = kid(harmonyNode, 'bass')
  if (bass) {
    const bStep = value(bass, 'bass-step')
    const bAlter = value(bass, 'bass-alter') || '0'
    if (bStep) symbol += `/${bStep}${ALTER_NAME[bAlter] ?? ''}`
  }
  return symbol
}

/* ─────────────────────────────── 主转换流程 ─────────────────────────────── */

/**
 * @param {string} xml
 * @param {{title?: string}} [options]
 * @returns {{abc: string, voices: number, bars: number, warnings: string[], lyrics: string[], meta: object}}
 */
export function musicxmlToAbc(xml, options = {}) {
  const doc = parseXml(xml)
  const score = findDeep(doc, 'score-partwise') ?? findDeep(doc, 'score-timewise')
  if (!score) throw new Error('这不是 MusicXML：找不到 <score-partwise> 根元素')

  const warnings = []
  const title = value(score, 'movement-title')
    || value(findDeep(score, 'work') ?? {}, 'work-title')
    || options.title || 'Untitled'

  const partList = findDeep(score, 'part-list')
  const partNames = new Map()
  for (const sp of kids(partList, 'score-part')) {
    partNames.set(sp.attrs.id, value(sp, 'part-name') || sp.attrs.id)
  }

  const parts = kids(score, 'part')
  if (!parts.length) throw new Error('MusicXML 里没有 <part>')

  const firstMeasure = kid(parts[0], 'measure') ?? {}
  const attributes = findDeep(firstMeasure, 'attributes') ?? {}
  const divisions = Number(value(attributes, 'divisions') || 1) || 1
  const timeNode = kid(attributes, 'time') ?? {}
  const beats = Number(value(timeNode, 'beats') || 4) || 4
  const beatType = Number(value(timeNode, 'beat-type') || 4) || 4
  const keyNode = kid(attributes, 'key') ?? {}
  const fifths = value(keyNode, 'fifths') || '0'
  const mode = value(keyNode, 'mode')
  const tempo = findTempo(score) || 96

  // 单位换算：1 个 <duration> 单位 = 1/divisions 个四分音符 = base/(4*divisions) 个 ABC 单位。
  // 先在 L:1/16 下检查所有时值能否整除，不能整除才退到 L:1/32。
  const durations = [...String(xml).matchAll(/<duration>\s*(\d+)\s*<\/duration>/g)].map((m) => Number(m[1]))
  const use16 = durations.length > 0 && durations.every((d) => Number.isInteger((d * 16) / (4 * divisions)))
  const base = use16 ? 16 : 32
  const scale = base / (4 * divisions)
  if (!use16) warnings.push('时值在 L:1/16 下不能整除，已改用 L:1/32')

  const barUnits = (beats * base) / beatType

  // 每个 part → 一组小节 token
  const blocks = []
  const lyrics = []
  let bars = 0

  for (const part of parts) {
    const measures = kids(part, 'measure')
    const rendered = []
    let hasWords = false
    let current = ''
    for (const measure of measures) {
      const mark = rehearsalOf(measure)
      if (mark) current = mark
      const out = renderMeasure(measure, { scale, barUnits, warnings, lyrics })
      if (out.hasLyric) hasWords = true
      rendered.push({ abc: out.abc, section: current })
    }
    bars = Math.max(bars, rendered.length)
    blocks.push({
      name: partNames.get(part.attrs.id) ?? part.attrs.id,
      voice: hasWords ? 'Vocal' : 'Ins',
      measures: rendered,
    })
  }

  // ACE 只有两条线：Vocal 保第一个带词的，Ins 保第一个不带词的
  const pick = (voice) => blocks.find((b) => b.voice === voice)
  const vocal = pick('Vocal')
  const instrumental = pick('Ins')
  for (const b of blocks) {
    if (b !== vocal && b !== instrumental) {
      warnings.push(`额外的声部「${b.name}」已忽略：ACE 只唱 Vocal 与 Ins 两条线`)
    }
  }
  if (!vocal && instrumental) {
    // 纯器乐：旋律写进 Ins，ACE 允许没有 Vocal
  }
  if (!vocal && !instrumental) throw new Error('没有从 MusicXML 里读到任何音符')

  const head = [
    'X:1',
    `T:${title.replace(/\s+/g, ' ')}`,
    `M:${beats}/${beatType}`,
    `L:1/${base}`,
    `Q:1/4=${Math.round(tempo)}`,
  ]
  if (vocal) head.push('V: Vocal clef=treble name="Vocal Melody" snm="Vocal"')
  if (instrumental) head.push('V: Ins clef=treble name="Ins Melody" snm="Inst."')
  head.push(`K:${abcKey(fifths, mode)}`)

  // 按段落分块：每个 ( % name ) 下先 Vocal 再 Ins，段落与歌词标签同序
  const ordered = [vocal, instrumental].filter(Boolean)
  const total = Math.max(...ordered.map((b) => b.measures.length), 0)
  const sectionAt = (i) => ordered.find((b) => b.measures[i]?.section)?.measures[i].section ?? ''
  // 先把小节按段落切成连续区间，再在每段内各声部输出一整块
  const ranges = []
  let start = 0
  for (let i = 1; i <= total; i += 1) {
    if (i === total || sectionAt(i) !== sectionAt(start)) {
      ranges.push({ section: sectionAt(start), start, end: i })
      start = i
    }
  }
  const body = []
  for (const range of ranges) {
    if (range.section) body.push(`% ${range.section}`)
    for (const block of ordered) {
      const bars = block.measures.slice(range.start, range.end).map((m) => `${m.abc ?? 'Z'}|`).join('')
      if (!bars) continue
      body.push(`V: ${block.voice}`)
      body.push(bars)
    }
  }

  const abc = [...head, '', ...body, ''].join('\n')

  return {
    abc,
    sections: ranges.map((r) => r.section).filter(Boolean),
    voices: [vocal, instrumental].filter(Boolean).length,
    bars,
    warnings,
    lyrics,
    meta: { title, divisions, beats, beatType, fifths, tempo, base, barUnits },
  }
}

/** 小节上的段落标记（<rehearsal> 优先，其次 direction 里的 <words>）。 */
function rehearsalOf(measure) {
  for (const dir of kids(measure, 'direction')) {
    const reh = findDeep(dir, 'rehearsal')
    if (reh?.text) return reh.text.trim().toLowerCase().replace(/\s+/g, '-')
    const words = findDeep(dir, 'words')
    if (words?.text && /^(intro|verse|pre-chorus|chorus|bridge|solo|outro|hook|refrain)\b/i.test(words.text.trim())) {
      return words.text.trim().toLowerCase().replace(/\s+/g, '-')
    }
  }
  return ''
}

function findTempo(node) {
  const sound = findDeep(node, 'sound')
  if (sound?.attrs?.tempo) return Number(sound.attrs.tempo) || null
  const perMinute = findDeep(node, 'per-minute')
  if (perMinute?.text) return Number(perMinute.text) || null
  return null
}

/**
 * 渲染一个小节。MusicXML 的 `<chord/>` 表示与前一个音同时发声，这里把它们合并成
 * 一个音（取最高音），并把同一拍上的 `<harmony>` 放进前缀。
 */
function renderMeasure(measure, ctx) {
  const { scale, barUnits, warnings, lyrics } = ctx
  const events = []   // { chord: string|null, kind:'note'|'rest', step, alter, octave, units }
  let pendingHarmony = null
  let hasLyric = false

  const children = measure.children ?? []
  for (const node of children) {
    if (node.name === 'harmony') {
      const symbol = abcHarmony(node)
      if (symbol) pendingHarmony = symbol
      continue
    }
    if (node.name !== 'note') continue
    if (kids(node, 'grace').length) continue

    const isChord = kids(node, 'chord').length > 0
    const duration = Number(value(node, 'duration') || 0)
    if (duration <= 0) continue
    const units = Math.round(duration * scale)
    if (units <= 0) continue

    const isRest = kids(node, 'rest').length > 0
    const pitchNode = kid(node, 'pitch')

    if (isChord && events.length) {
      // 与上一个音合并，取更高者
      const prev = events[events.length - 1]
      if (prev.kind === 'note' && pitchNode) {
        const step = value(pitchNode, 'step')
        const alter = Number(value(pitchNode, 'alter') || 0)
        const octave = Number(value(pitchNode, 'octave') || 4)
        if (pitchRank(step, alter, octave) > pitchRank(prev.step, prev.alter, prev.octave)) {
          Object.assign(prev, { step, alter, octave })
        }
      }
      continue
    }

    const event = { chord: pendingHarmony, units, kind: isRest ? 'rest' : 'note' }
    pendingHarmony = null
    if (!isRest && pitchNode) {
      event.step = value(pitchNode, 'step')
      event.alter = Number(value(pitchNode, 'alter') || 0)
      event.octave = Number(value(pitchNode, 'octave') || 4)
    }
    const lyricNode = kid(node, 'lyric')
    if (lyricNode) {
      hasLyric = true
      // <lyric><text>hello</text></lyric> —— 文字就在 text 子节点里
      const textNode = kid(lyricNode, 'text')
      const text = (textNode?.text ?? lyricNode.text ?? '').trim()
      if (text) lyrics.push(text)
    }
    events.push(event)
  }

  // 渲染成 ABC
  const parts = []
  let used = 0
  for (const ev of events) {
    const units = splitUnits(ev.units)
    let body
    if (ev.kind === 'rest') {
      body = units.map((u) => `z${u}`).join('-')
    } else {
      const p = abcPitch(ev.step, ev.alter, ev.octave)
      if (!p) { warnings.push('遇到无法识别的音高，已跳过'); continue }
      body = units.map((u) => `${p}${u}`).join('-')
    }
    parts.push(ev.chord ? `"${ev.chord}"${body}` : body)
    used += ev.units
  }

  // 小节必须精确满
  if (used < barUnits) {
    parts.push(splitUnits(barUnits - used).map((u) => `z${u}`).join('-'))
  } else if (used > barUnits) {
    warnings.push(`小节超长 ${used - barUnits} 单位，已按小节长度截断`)
  }
  if (!parts.length) return { abc: 'Z', hasLyric }
  return { abc: parts.join(''), hasLyric }
}
