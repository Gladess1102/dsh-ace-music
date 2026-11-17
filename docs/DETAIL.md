# ACE Music

把 [ACE Music](https://acemusic.ai) 的 MCP 服务器接进 DeepSeek Harness：登录一次，写歌、续写旋律、上传音频、查歌、下载成品都成为原生的 `acemusic_*` 工具，不需要离开对话。

## 为什么需要一个插件

`https://acemusic.ai/mcp` 是 Streamable HTTP 的 MCP 服务器，只接受 **OAuth 令牌**（`WWW-Authenticate: Bearer resource_metadata=...`）。DSH 自带的 `@deepseek-ai/dsh-mcp-client` 只支持静态请求头，不处理 401 的 OAuth 挑战——它适合用个人访问令牌（PAT）连的服务器，连不了 ACE Music。

所以本插件自己完成授权：动态客户端注册 → PKCE 授权码流程 → 本地回环回调 → 换取并续期令牌，然后用 Bearer 令牌桥接远端工具。整个过程中，密码只在 ACE Music 自己的页面上输入，插件拿到的只是你点「允许」后发出的令牌。

## 用法

1. 调用 `acemusic_login`。浏览器会弹出 ACE Music 的授权页，确认应用名与权限后点**允许**。
2. 回到对话调用 `acemusic_status`，看到套餐与剩余积分即登录成功。
3. 直接说需求即可，例如「用 ACE Music 写一首 city pop，关于夏夜骑车」——模型会调用 `acemusic_create_song`。

令牌存在 `~/.dsh/ace-music/credentials.json`（权限 0600，仅当前用户可读），有效期 3600 秒，到期自动用 refresh_token 续期。想换账号就调用 `acemusic_logout`，令牌会被删除。

## 工具

登录后，远端的全部工具会注册成 `acemusic_*`：

| 工具 | 作用 |
|---|---|
| `acemusic_create_song` | 从风格（必填）、歌词、标题写一首歌 |
| `acemusic_continue_score` | 给一段 ABC 或 MIDI 开头续写旋律 |
| `acemusic_upload_audio` | 把本地音频加进账号的曲库（会自动转写） |
| `acemusic_get_skill` | 读 ACE Music 的用法说明（如做 cover 的流程） |
| `acemusic_get_song` | 查歌曲状态（writing → rendering → ready / failed）与详情 |
| `acemusic_list_songs` | 分页列出账号里的歌与上传 |
| `acemusic_download_song` | 取一首歌的下载链接（MP3 / WAV / MIDI） |
| `acemusic_show_songs` | 在支持卡片的应用里放播放器（在 DSH 中返回文本） |
| `acemusic_show_upgrade` | 显示升级卡（在 DSH 中返回文本） |
| `acemusic_get_account` | 套餐、剩余积分、下次刷新额度 |

另有三个管理工具：`acemusic_login`、`acemusic_status`、`acemusic_logout`，以及兜底通道 `acemusic_call`（直接按名字调用任意远端工具）。

## 限制

- **生成要等。** 一首歌通常几十秒到几分钟，`acemusic_create_song` 的超时上限是 5 分钟；超时不代表失败，用 `acemusic_get_song` 按 id 查状态即可。
- **每次生成消耗账号积分。** 免费档 `create_song` 每次 4 credits、一次出两个版本，额度每 24 小时补一次（当前档位是 20 credits）；实时余额用 `acemusic_get_account` 查。上传另有分钟数配额。
- **需要能访问 acemusic.ai。** 插件默认直连；只有在系统 DNS 解析失败时才回退到直连公共 DNS（8.8.8.8 / 1.1.1.1 / 223.5.5.5）重试一次。不内置代理，也不支持自定义域名。
- 登录回调占用本机 `127.0.0.1:8765`；被占用时用环境变量 `ACE_MUSIC_PORT` 换端口后重新登录。
- `acemusic_show_songs` / `acemusic_show_upgrade` 的卡片是给 Claude、ChatGPT 一类客户端设计的，在 DSH 里只返回文本，没有播放器。

## 远端协议（实现依据）

- **端点**：`https://acemusic.ai/mcp`，只接受 POST；GET 返回 405。传输是 Streamable HTTP。
- **授权元数据**：`/.well-known/oauth-protected-resource` → `resource: https://acemusic.ai/mcp`，`scopes_supported: songs:read, songs:create`，`bearer_methods_supported: ["header"]`。
- **授权服务器**：`/.well-known/oauth-authorization-server` → `authorization_endpoint /oauth/authorize`、`token_endpoint /oauth/token`、`registration_endpoint /oauth/register`、`code_challenge_methods_supported: ["S256"]`、`grant_types: authorization_code, refresh_token`。
- **未认证响应**：`401` + `WWW-Authenticate: Bearer resource_metadata="…", scope="songs:read songs:create"`。
- **令牌**：`access_token` 有效期 3600 秒（`expires_in`），配 `refresh_token`；请求头 `Authorization: Bearer <token>`。
- **会话**：`initialize` 的响应可能带 `Mcp-Session-Id`，后续请求需回带；`Mcp-Protocol-Version` 固定为 `2025-06-18`。
- **响应体**：可能是 `application/json`，也可能是 `text/event-stream`（逐行 `data:` 携带 JSON-RPC），两种都需解析。
- **工具清单**：由 `tools/list` 决定（实测 10 个）。ACE Music 增删工具后，调用 `acemusic_tools` 重新拉取即可，无需改插件。
