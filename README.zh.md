# dsh-ace-music

[English](README.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件

**把 ACE Music 的 MCP 服务器接进 DeepSeek Harness。** 登录一次，之后在对话里直接写完整的歌（含人声），也能查歌、列歌、下载。

---

## 先说清楚 ACE Music 到底是什么

**ACE Music v1 目前在 Artificial Analysis 的 AA-Music-Vocal v1.1 榜上以 1160 Elo 排名第一** —— 领先 Suno v6（1144）、Suno v6-mini（1132）、Mureka V9.5（1101）和 Lyria 3.5（1050）。这个榜是盲听评测：评测者听同一提示词下、不署名模型的多首曲子，再选更喜欢的那首。它评的是**人声**这一维度，不是逐个曲风的横扫——但人声恰恰是 AI 音乐最容易露馅的地方。

两个模型，干两件不同的事。

**ACE Music v1 —— 给字，出歌。** 给它风格描述、你自己的歌词，或者两者都给。它是给不写乐理的人用的：描述一句"温暖的独立民谣，木吉他，带一点怀旧感"，回来一首完整的歌。它还认**括号里的表演指令**——`(hum softly)`、`(sing with a raspy voice)`、`(add guitar here)`——于是你控制的不仅是唱什么，还有**怎么唱，以及编曲怎么往前走**。

**ACE Music v1.1 Preview —— 给你能控制的谱。** 它先生成 **ABC 记谱**，把旋律、节奏、和弦定下来，然后**照这份谱去演奏**：先作曲，再出声。你可以从哼出来的、弹出来的、或写好的 MIDI 起头，改音符改和弦，再重新生成——**谱是不变的那一层**。模型页也明说了：每次生成都是一次新的演奏，所以谱相同、声音也可能不同。

除此之外还有：键盘弹旋律、哼唱成歌、图片成歌、AI Cover、Mashup、分轨（stem separation），以及主旋律与和弦的 MIDI / 乐谱导出。

官方定价（美元）：**Free** 每天 20 credits（约 10 首）、上传 10 分钟、共享队列、**不能下载、无商用权**；**Creator** $7.90/月 —— 1,000 credits（约 500 首）、上传 30 分钟、无限下载、优先队列、分轨器、商用权；**Artist** $16.58/月 —— 2,500 credits、上传 60 分钟，另含 ACE Studio。一次生成 4 credits，返回两首歌。开源的 ACE-Step 1.5 可以自己跑，无限制。

实时数字以工具为准：`acemusic_get_account` 返回你账号的真实余额。

## 安装之前：先去 ACE Music 注册账号

这个插件用的是**你自己的账号**——它没有内置密钥，也不能替你注册。

1. 打开 <https://acemusic.ai> 注册（邮箱或它提供的方式）。
2. 在那个浏览器里保持登录——插件会打开授权页，已登录就只需点一下。
3. 建议顺手在网站上先做一首歌。你会摸清 style 和 lyrics 两个字段的脾气，而这正是 `acemusic_create_song` 发出去的东西。

登录不花钱。免费账号除「下载音频」和「商用」之外，功能都能试。

## 安装

```bash
# 从 npm 安装
dsh plugin --profile <你的 profile> add dsh-ace-music

# 或者直接从 GitHub 安装
dsh plugin --profile <你的 profile> add github:Gladess1102/dsh-ace-music
```

装完在 DSH 里：**插件** → **添加插件**，或重启即可——bundle patch 在加载时生效。

## 登录

```
acemusic_login
```

浏览器打开 `acemusic.ai`，页面显示「将 DeepSeek Harness (ACE Music plugin) 连接到 ACE Music」，点**允许**。令牌存到 `~/.dsh/ace-music/credentials.json`（权限 `0600`，仅当前用户可读），随后全部 `acemusic_*` 工具可用。

```
acemusic_status
```

返回套餐、剩余积分、下次补充时间、剩余上传分钟数。令牌有效期 3600 秒，到期自动续期；`acemusic_logout` 删除本机令牌。

## 工具

远端 10 个工具桥接成本地的 `acemusic_*`：

| 工具 | 作用 |
|---|---|
| `acemusic_create_song` | 风格（必填）+ 歌词 + 标题 → 一首歌。v1.1 可另附 ABC/MIDI 乐谱。 |
| `acemusic_continue_score` | 给一段 ABC 或 MIDI 开头，续写旋律（v1.1）。 |
| `acemusic_upload_audio` | 把录音或 demo 加进曲库，自动转写。 |
| `acemusic_get_skill` | ACE Music 自己的写作规范（`cover` / `lyrics` / `mashup` / `score-format`）。 |
| `acemusic_get_song` | 查状态（`writing` → `rendering` → `ready` / `failed`）、标题、风格、歌词、歌页链接。 |
| `acemusic_list_songs` | 分页列出曲库（新到旧）。 |
| `acemusic_download_song` | 下载链接（MP3 / WAV / MIDI）。仅付费档。 |
| `acemusic_show_songs` | 播放器卡片——在 Claude / ChatGPT 里有意义，DSH 里返回纯文本。 |
| `acemusic_show_upgrade` | 升级卡——DSH 里返回纯文本。 |
| `acemusic_get_account` | 套餐、积分、补充计划、上传分钟、可用模型。 |

另有六个本地工具：

| 工具 | 作用 |
|---|---|
| `acemusic_login` | 发起 OAuth，返回授权链接并在后台等待。 |
| `acemusic_status` | 登录状态 + 实时账号信息。 |
| `acemusic_logout` | 删除本机令牌。 |
| `acemusic_tools` | 重新拉取远端工具并注册（幂等）。 |
| `acemusic_call` | 兜底通道：按名字直接调任意远端工具，参数用原始 JSON。 |
| `acemusic_score` | 把 MusicXML 转成 ACE 的 ABC 方言，直接用于 `create_song` 的 `score.abc`。 |

## 内置的官方写作规范

ACE Music 通过 `get_skill` 公开的四份规范，随本包存放在 `docs/skills/`：

| 文件 | 动笔前读它 |
|---|---|
| `lyrics.md` | 写任何一首歌——段落标签、括号表演指令、行数、长度 |
| `cover.md` | 做 cover——换风格、调、速、语言时怎么把谱和歌词交出去 |
| `mashup.md` | 把两三首歌拼成一首——统一调与速度，段落轮流 |
| `score-format.md` | 写或改 ABC 记谱，以及 MIDI 怎么被读 |

`acemusic_get_skill` 会**优先返回本地副本**，模型不必先联网取一次就能读到规则；返回里也写明了这一点，并指向 `acemusic_call` 以便取远端最新版。这些文本的作者是 ACE Music（© Timedomain, Inc.），此处原样缓存；MIT 只覆盖本项目的代码。

## MusicXML 作为写谱层

ACE Music 的 MCP 端点只收 **ABC 或 MIDI**，但它的网页端收 `.musicxml`、`.xml`、`.mxl`（Idea → Sing sheet music，走 ACE Music v1.1 Preview）。这条路径 agent 走不了——MCP 没有等价的上传入口。

所以本插件的分工是：**用 MusicXML 作曲，用 ABC 交付。**

MusicXML 更适合模型写谱：音高在 `<pitch>`、时值在 `<duration>`、和声在 `<harmony>`、歌词在 `<lyric>`，一小节就是一个 `<measure>`，可以逐节增量生成；而一小节里时值加起来不等于拍号，是能用代码查出来的。相比 ABC，你更不容易把和弦写成音符，或者少算一拍却没发现。

`acemusic_score` 负责转换：

| MusicXML | ABC |
|---|---|
| 带 `<lyric>` 的 part | `V: Vocal` |
| 其他 part | `V: Ins`（ACE 只认这两条线） |
| `<note>` 带 `<chord/>` | 只取最高音 |
| `<harmony>` | `"Dm"` / `"F/A"` 和弦符号 |
| `<direction><rehearsal>` | `% verse`、`% chorus`…… |
| `divisions` + `duration` | ACE 的 `L:1/16` 单位，除不尽退 `1/32` |
| `alter` | `^` 升、`_` 降 |

两个坑。**段落必须完全对齐**：`% <section>` 的数量与顺序，必须等于歌词里 `[section]` 标签的数量与顺序，否则 ACE 返回 `score_invalid`（不扣费）。**只有两个声部**：四部合唱写不进谱里——写最高声部，和声意图写进 style。完整契约与踩过的坑见 [docs/musicxml.md](docs/musicxml.md)。

在参考作品上的实测（46 小节、72 BPM、D 小调、女声合唱、`acemusic-v1.1`）：

| 段落 | 低频 <200 Hz | RMS |
|---|---|---|
| intro | 6.4% | −24.3 dB |
| verse | 4.7% | −20.9 dB |
| chorus | 6.9% | −17.5 dB |
| **bridge（谱标 a cappella）** | **1.4%** | −22.0 dB |
| 终段 chorus | 7.9% | −17.0 dB |
| outro | 1.5% | −29.8 dB |

段落结构、动态起伏与那段 a cappella 都从 MusicXML 一路活到了音频里；谱面算出的 153 秒与实际 157–160 秒对得上。

## 为什么这必须是一个插件

`https://acemusic.ai/mcp` 是只认 **OAuth** 的 Streamable HTTP MCP 服务器——未认证请求返回 `401` 加 `WWW-Authenticate: Bearer resource_metadata=...`。

DSH 自带的 `@deepseek-ai/dsh-mcp-client` 只会附加静态请求头（`createTransport` 从不传 `authProvider`），应答不了这个挑战。而接受个人访问令牌（PAT）的服务器——GitHub 那类——一切正常，所以这个缺口很容易被忽略。

本插件补的就是这一层：动态客户端注册、PKCE 授权码流程、`127.0.0.1` 回环回调、换取与刷新令牌，然后用 Bearer 令牌把远端工具桥接成原生 DSH 工具。没有 MCP SDK、没有运行时依赖——就是一个基于 `fetch` 的小 JSON-RPC 客户端。

## 配置

| 变量 | 默认 | 含义 |
|---|---|---|
| `ACE_MUSIC_PORT` | `8765` | OAuth 回调占用的回环端口。被占用时换一个。 |

状态存放在 `~/.dsh/ace-music/credentials.json`（`0600`）。删掉该文件，或调用 `acemusic_logout`，即解除账号绑定。

## 隐私与安全

- 密码只在 `acemusic.ai` 页面输入，插件看不到。它拿到的是你明确点过「允许」后发出的 OAuth 令牌，权限范围 `songs:read songs:create`。
- 令牌存在 DSH 配置之外，因此不会出现在 `cordis.patch.yml`、日志或被拷走的 profile 里。
- 网络请求只发往 `acemusic.ai`，没有遥测，也没有第三方中转。
- 插件不下载、也不运行任何模型权重；生成发生在 ACE Music 服务器上，走你的账号和额度。

如果系统解析器解析 `acemusic.ai` 失败（某些 VPN 或分流配置会），客户端会退回公共 DNS 重试一次——正常路径就是普通 `fetch`。

## 需要知道的限制

- **生成要等。** 一首歌几十秒到几分钟。`acemusic_create_song` 的工具超时是 5 分钟；超时不等于失败——用 id 调 `acemusic_get_song` 轮询。
- **每次生成都花积分。** 一次 4 credits，返回两首歌。
- **免费档不能下载。** `acemusic_download_song` 会返回升级提示；歌页在线播放依然免费。免费档的作品**也没有商用权**（之后升级不会追溯授予），而且生成走**共享队列**，可能排队。
- **`show_songs` / `show_upgrade`** 是为有卡片渲染的客户端设计的，在 DSH 里只返回文本。
- 远端工具列表在存在令牌时于启动时拉取，也可用 `acemusic_tools` 重新拉取；ACE Music 新增工具后调一次即可同步。

## 开发

```bash
npm test         # MusicXML 转换器的 8 个用例
npm run check    # 逐模块语法检查
```

| 文件 | 角色 |
|---|---|
| `index.js` | 插件入口：`apply(ctx)`、工具注册、远端桥接、本地优先的规范读取 |
| `src/oauth.js` | 动态注册、PKCE、回调服务、换取与刷新令牌 |
| `src/mcp.js` | 最小 MCP 客户端（initialize / tools/list / tools/call，兼容 JSON 与 SSE） |
| `src/net.js` | `fetch` 封装：超时、重试、DNS 回退 |
| `cordis.patch.yml` | bundle patch：一行插件，`id: ace-music` |
| `docs/skills/` | ACE Music 官方写作规范，离线缓存 |

远端协议细节见 [docs/DETAIL.md](docs/DETAIL.md)。

## 许可

代码 MIT。`docs/skills/` 下的规范文本归 ACE Music 所有，此处带署名缓存。本项目与 ACE Studio / ACE Music 无隶属关系，是对其公开 MCP 端点的独立客户端。
