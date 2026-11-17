# MusicXML 作为 agent 的写谱层

> 结论先行：**用 MusicXML 作曲，用 ABC 交付。** ACE Music 的 MCP 只收 ABC 或 MIDI，
> 而 MusicXML 才是适合模型逐小节写谱、又便于程序校验的格式。本插件提供
> `acemusic_score` 把前者转成后者，这份文档是转换的契约与踩过的坑。

## 一、三方关系

| 形态 | 谁用 | 说明 |
|---|---|---|
| **MusicXML**（`.musicxml` / `.xml` / `.mxl`） | **agent 写谱** | 结构化、可校验、可逐小节增量生成；一个文件含音高、时值、歌词、和弦、力度、速度 |
| **ABC**（ACE 方言） | **MCP 交付** | `create_song(score.abc)` / `continue_score` 收的唯一文本格式 |
| **MIDI** | 备选交付 | `score.midi_base64`（≤2 MB）；ACE 会按规则推断旋律与和弦 |

值得注意的是：ACE Music **网页端**本来就收 `.musicxml`、`.xml`、`.mxl`（Idea → Sing sheet music，
走 ACE Music v1.1 Preview），但**这条路径 agent 走不了**——MCP 没有文件上传式入口，
只有 `score.abc` 与 `midi_base64`。所以 MusicXML 只能当创作层，落地前必须转换。

## 二、为什么模型更该写 MusicXML

- **结构即约束。** 音高在 `<pitch>`、时值在 `<duration>`、和弦在 `<harmony>`，每一层都有明确元素，
  模型不容易把"和弦"写成"音符"。
- **可逐小节生成。** 一次补一个 `<measure>`，比整体重写一段 ABC 更稳；长度错了立刻能看出来。
- **校验便宜。** 小节内 `duration` 之和与拍号不符是可编程检测的；ABC 里数错一个数字很难发现。
- **歌词与旋律同源。** `<lyric><text>` 挂在音符上，词谱天然对齐。
- **可被现成工具消费。** MuseScore、Dorico、Sibelius、LilyPond 都读它——出问题能拿去人工核对。

ABC 的优势相反：短、人类可读、ACE 原生。所以分工是**写谱用 XML，交付用 ABC**。

## 三、ACE 收的 ABC 有多窄（决定了转换的取舍）

来自官方 `get_skill score-format`，这几条会直接导致拒收，必须内建：

1. **只有两个声部**：`V: Vocal`（唱的旋律）与 `V: Ins`（器乐线）。**没有 `V:1` / `V:Piano` / `V:Bass`**。
   多声部合唱无法在谱里直接表达——只能给一条主旋律，合唱靠 style 与歌词括号描述。
2. **每个段落必须有 `% <name>` 注释**，且**顺序与数量要与歌词里的 `[section]` 标签完全一致**，
   否则报 `score_invalid`：`The lyrics have 8 sections but the score has 0`。
3. **小节必须精确满**：4/4 在 `L:1/16` 下每小节 16 单位。
4. **时值只能是** 1/2/3/4/6/8/12/16/24/32/48；其他长度要拆成可接受值之和并用 `-` 连音。
5. **无反复记号**（`|:` `:|`、`|]`），重复的段落要写全。
6. 至少 4 个音；最多 450 秒；和弦符号支持 `C`、`Am`、`F/A`、`Bbmaj7` 等有限集合。

## 四、agent 只需要写这些元素（最小子集）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Voices Rise</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Vocal</part-name></score-part>
    <score-part id="P2"><part-name>Ins</part-name></score-part>
  </part-list>

  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>                 <!-- 每四分音符 4 个单位 -->
        <key><fifths>-1</fifths><mode>minor</mode></key>   <!-- D 小调 -->
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction><direction-type><rehearsal>verse</rehearsal></direction-type></direction>
      <harmony><root><root-step>D</root-step></root><kind text="minor">minor</kind></harmony>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <lyric><text>Sil</text></lyric>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
        <lyric><text>ver</text></lyric>
      </note>
      <!-- … 补齐到 16 个单位（4/4） -->
    </measure>
  </part>
</score-partwise>
```

只要这几样：`part-list` / `part` / `measure` / `attributes`（divisions、key、time、clef）/
`direction+rehearsal`（段落）/ `harmony`（和弦）/ `note`（pitch、duration、type、lyric）。

**不要写**：`<backup>` / `<forward>` 多声道切换、`<print>` 排版、`<sound>` 细节、
装饰音 `<grace>`（会被丢）、反复记号。

## 五、转换规则（`acemusic_score` 实际怎么做）

| MusicXML | ABC | 说明 |
|---|---|---|
| `part` 带 `<lyric>` | `V: Vocal` | 有词的声部当旋律 |
| 其他 `part` | `V: Ins` | 器乐线；纯器乐作品把旋律写这里 |
| `divisions` + `duration` | `L:1/16` 单位 | `units = duration × 16 ÷ (4 × divisions)`；除不尽自动退 `L:1/32` |
| `key/fifths` + `mode` | `K:Dm` | −7…+7 全支持 |
| `time` | `M:4/4` | |
| `sound/@tempo` 或 `per-minute` | `Q:1/4=72` | |
| `direction/rehearsal` | `% verse` | 段落边界；也认 `<words>` 里的 intro/verse/chorus… |
| `note/pitch` | `_b4` / `^c4` / `b4` | `alter` → `^` `^^` `_` `__`；octave 4 = 小写 |
| `note/rest` | `z4` | 整小节可写 `Z` |
| `<chord/>` | 取**最高音** | ACE 只唱单旋律线 |
| `<harmony>` | `"Dm"` / `"F/A"` | 挂在该拍音符前，给 v1.1 定和声 |
| `tie` | `-` | 长音拆段时自动生成 |

**和弦堆叠的现实**：`<chord/>` 表示与前音同时发声，转成 ABC 时只保留最高音。
想要真正的和声，请写 `<harmony>`（和弦符号）——那才是 v1.1 用来配置和声的输入。

## 六、交付前自查

- [ ] 每小节 `duration` 之和 = `beats × divisions × 4 / beat-type`
- [ ] 段落数量与顺序 == 歌词 `[section]` 标签的数量与顺序（**最常见的拒收原因**）
- [ ] 歌词每行约等于该段 2 小节的音节数
- [ ] 只有旋律与器乐两条线，没有第二条带词声部
- [ ] 总时长 = 小节数 × beat-type ÷ 每小节拍数 ÷ BPM × 60 ≤ 450 秒
- [ ] 没有反复记号；重复写全

## 七、实测：这份格式的控制力到底有多强

2026-11-18 用本流程做了一首 46 小节、72 BPM、D 小调的梶浦由记风格女声合唱
（`acemusic-v1.1`，2 个版本），客观测量结果：

| 段落（谱） | 低频 <200 Hz | 中频 400–2k | RMS |
|---|---|---|---|
| intro | 6.4% | 46.2% | −24.3 dB |
| verse | 4.7% | 33.7% | −20.9 dB |
| pre-chorus | 5.7% | 39.9% | −18.6 dB |
| chorus | 6.9% | 38.0% | −17.5 dB |
| **bridge（谱标 a cappella）** | **1.4%** | **47.1%** | −22.0 dB |
| chorus（终段） | 7.9% | 31.5% | −17.0 dB |
| outro | 1.5% | 41.2% | −29.8 dB |

- **段落结构被准确执行**：响度曲线 intro → 渐强 → bridge 掉下 → 终段最强 → outro 收，
  与谱的 `% section` 一一对应。
- **a cappella 真的生效**：bridge 低频仅 1.4%（其余段落 5–9%），说明器乐让位给人声。
- **时长对得上**：谱算 153 秒，实际 157–160 秒。
- **配器约束生效**：全曲低频 5%，符合"无鼓组、无贝斯、纯原声"的要求。

所以答案是：**在"结构、段落、动态、时长"这几层，谱控制力很强；在"具体几个声部怎么分配"上，
谱管不到**——那部分由 style 描述与歌词括号决定。写多声部作品时，把和声意图写进 style。

## 八、踩过的坑

| 现象 | 原因 |
|---|---|
| `The lyrics have 8 sections but the score has 0` | 谱里没有 `% <section>`；只写歌词标签不够 |
| `unsupported JSON schema: parameters.score.additionalProperties` | 与本文件无关，是桥接工具的参数转换；已在 0.1.0 修 |
| 转换后小节数比预期多 1 | 把 `<attributes>` 单独放成了第一个 `<measure>`；它应并入第一个实际小节 |
| 音高被丢掉 | `<step>` 只认 `A`–`G`；`Bb` 要写成 `<step>B</step><alter>-1</alter>` |
| 旋律断成两个声部 | MusicXML 里出现了两条带 `<lyric>` 的 part；ACE 只唱第一条 |
