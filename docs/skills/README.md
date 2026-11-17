# ACE Music 官方写作规范（随插件内置）

这四个文件是 ACE Music 官方通过 MCP `get_skill` 工具提供的写作指南，**原文抓取**于 2026-11-18，随插件内置，目的是让模型在动笔前不必先联网取一次。

| 文件 | 什么时候读 |
|---|---|
| `lyrics.md` | 写任何一首歌之前：段落标签、括号表演指令、行数、空拍、人声与时长 |
| `cover.md` | 要做 cover：换风格/调/速/语言时，谱与歌词怎么给 |
| `mashup.md` | 要把两三首歌拼成一首：调与速度统一、段落如何轮流 |
| `score-format.md` | 要写或改 ABC 谱、MIDI 怎么解：音高、节奏、段落、pickup |

`acemusic_get_skill` 会优先返回这里的副本（离线、零延迟）；如果你怀疑官方已更新，用 `acemusic_call` 传 `name` 走远端取最新版。

## 版权

这些文本的作者是 ACE Music（© 2026 Timedomain, Inc.），不是本项目的原创内容。这里只是**缓存官方公开输出**以便离线阅读；原文以 <https://acemusic.ai> 与官方 MCP `get_skill` 的实时返回为准。MIT 许可只覆盖本项目的代码，不覆盖这些文档。
