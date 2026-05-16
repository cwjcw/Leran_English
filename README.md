# Leran English

小学四年级英语口语学习系统后台，基于 FastAPI 构建。项目面向家长和孩子：家长维护单词库，系统根据单词生成场景对话和趣味短文，孩子通过语音进行对话练习和背诵评测。

## 主要功能

- 单词管理：支持单词 CRUD 和批量导入，适合按课本单元维护词库。
- 场景生成：调用 DeepSeek-V3，根据核心单词生成适合四年级儿童的英语对话场景。
- 场景互动：接收孩子录音，调用 Whisper 转写英文文本，再调用 DeepSeek-V3 继续对话。
- 短文生成：根据选定单词生成 40-60 词的趣味短文，并创建背诵会话。
- 背诵评测：调用 Microsoft Azure Speech SDK 的发音评测和文本对齐能力，更新孩子当前背诵进度。

## 技术栈

- Python 3.10+
- FastAPI
- SQLAlchemy ORM
- SQLite，后续可通过环境变量切换 PostgreSQL
- DeepSeek-V3
- 硅基流动 SiliconFlow OpenAI-compatible API
- 阿里云百炼/千问 DashScope OpenAI-compatible API
- OpenRouter OpenAI-compatible API
- OpenAI Whisper API，或兼容 OpenAI 格式的转写接口
- Microsoft Azure Speech SDK

## 项目结构

```text
app
+-- main.py                 # FastAPI 应用入口
+-- schemas.py              # Pydantic 请求/响应模型
+-- api
|   +-- users.py            # 用户接口
|   +-- words.py            # 单词 CRUD 和批量导入
|   +-- scenario.py         # 场景生成和对话互动
|   +-- story.py            # 短文生成和背诵评测
+-- core
|   +-- config.py           # 环境变量和核心配置
+-- db
|   +-- models.py           # SQLAlchemy 数据库模型
|   +-- session.py          # 数据库连接和会话
+-- services
    +-- ai_service.py       # DeepSeek-V3 调用逻辑
    +-- speech_service.py   # Whisper 转写和 Azure 发音评测
```

## 数据表

- `users`：用户信息，包含用户名、星星数和创建时间。
- `user_api_keys`：用户 API Key 记录，只保存哈希值、短前缀、创建时间、最近使用时间和撤销时间，不保存明文 API Key。
- `words`：单词信息，包含英文、中文释义、音标和动态标签。
- `study_progress`：用户单词学习进度，记录学习状态和错误次数。
- `recitation_sessions`：背诵会话，记录短文原文、当前正确背诵位置和完成状态。

## API Key 设计

每个用户可以拥有一个或多个 API Key。后端采用以下方式存放：

- 创建 API Key 时生成形如 `le_xxx` 的随机密钥。
- 数据库只保存 `SHA-256` 哈希值，不保存明文密钥。
- 数据库额外保存 `key_prefix`，用于后台排查和展示，例如 `le_abcd1234`。
- 明文 API Key 只在创建用户或新建 Key 时返回一次，之后无法从数据库恢复。
- 撤销 Key 时只写入 `revoked_at`，历史记录保留。
- 业务接口通过请求头 `X-API-Key` 认证。

请求示例：

```http
GET /api/users/me
X-API-Key: le_your_api_key
```

生产环境注意事项：

- 不要把用户 API Key 记录到普通业务日志。
- 前端只应把 API Key 存在安全位置，避免提交到代码仓库。
- 如果怀疑泄露，调用撤销接口后重新创建一个新的 API Key。
- 当前项目使用 SHA-256 哈希保存 Key；如需更强的密钥治理，可以后续加入 Key 过期时间、权限范围和速率限制。

## 本地开发

项目已支持使用 `uv` 管理虚拟环境。

```powershell
uv venv .venv
.venv\Scripts\activate
uv pip install -r requirements.txt
```

启动服务：

```powershell
uv run uvicorn app.main:app --reload
```

默认服务地址：

```text
http://127.0.0.1:8000
```

接口文档：

```text
http://127.0.0.1:8000/docs
```

健康检查：

```text
GET /health
```

根路径：

```text
GET /
```

返回 API 状态和常用入口，例如 `/docs`、`/health`、`/api/users`。

## 配置环境变量

复制 `.env.example` 为 `.env`，然后填写实际密钥。

```powershell
copy .env.example .env
```

常用配置：

```env
DATABASE_URL=sqlite:///./english_learning.db

# 可选值：deepseek / siliconflow / qwen / openrouter
LLM_PROVIDER=deepseek

DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

SILICONFLOW_API_KEY=your_siliconflow_api_key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V3

QWEN_API_KEY=your_dashscope_api_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus

OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openrouter/auto

OPENAI_API_KEY=your_openai_api_key

TRANSCRIPTION_BASE_URL=https://api.siliconflow.cn/v1
TRANSCRIPTION_API_KEY=your_siliconflow_api_key
TRANSCRIPTION_MODEL=FunAudioLLM/SenseVoiceSmall

AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_azure_region
AZURE_SPEECH_LANGUAGE=en-US
```

### 切换大模型提供商

本项目的大模型调用统一使用 OpenAI-compatible Chat Completions 格式，因此 DeepSeek、硅基流动和千问可以共用同一套服务代码。

使用 DeepSeek：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

使用硅基流动：

```env
LLM_PROVIDER=siliconflow
SILICONFLOW_API_KEY=your_siliconflow_api_key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V3
```

使用千问：

```env
LLM_PROVIDER=qwen
QWEN_API_KEY=your_dashscope_api_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

使用 OpenRouter：

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openrouter/auto
```

也可以把 `OPENROUTER_MODEL` 改成具体模型 ID，例如 `openai/gpt-4o-mini`、`google/gemini-2.5-flash`、`anthropic/claude-3.5-haiku` 等。具体可用模型以 OpenRouter 控制台为准。

### 语音转写

项目默认使用硅基流动的 SenseVoiceSmall 转写模型：

```env
TRANSCRIPTION_BASE_URL=https://api.siliconflow.cn/v1
TRANSCRIPTION_API_KEY=your_siliconflow_api_key
TRANSCRIPTION_MODEL=FunAudioLLM/SenseVoiceSmall
```

如果 `TRANSCRIPTION_API_KEY` 为空，代码会回退使用 `SILICONFLOW_API_KEY`。如果要改回 OpenAI Whisper，可以配置：

```env
TRANSCRIPTION_BASE_URL=
TRANSCRIPTION_API_KEY=your_openai_api_key
TRANSCRIPTION_MODEL=whisper-1
```

### Azure 发音评测推荐

Azure Speech Pronunciation Assessment 不像大模型接口一样选择具体模型名。推荐配置是：

```env
AZURE_SPEECH_LANGUAGE=en-US
```

也就是使用美式英语评测，适合小学英语口语练习和课本发音标准。等你开通 Azure Speech 资源后，只需要补充：

```env
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_azure_region
```

当前没有 Azure Key 时，背诵评测接口 `/api/story/verify` 会自动降级为“语音转写 + 单词顺序对齐”：

- 先用 `TRANSCRIPTION_*` 配置的转写接口把录音转成英文文本。
- 再把转写文本和短文原文逐词比较。
- 返回格式仍然保持 `verified_index` 和 `words_status`，方便前端先完整联调。
- 这个降级方案可以判断孩子大致背到哪里，但不能替代 Azure 的专业发音评分。

如果要使用 PostgreSQL，把 `DATABASE_URL` 改成类似：

```env
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/english_learning
```

使用 PostgreSQL 时还需要额外安装 PostgreSQL 驱动，例如：

```powershell
uv pip install "psycopg[binary]"
```

## 主要接口

### 用户

创建用户：

```http
POST /api/users
Content-Type: application/json

{
  "username": "Tom"
}
```

创建用户成功时会返回一个 API Key。这个 Key 只返回一次，请由调用方妥善保存：

```json
{
  "id": 1,
  "username": "Tom",
  "total_stars": 0,
  "created_at": "2026-05-17T00:00:00",
  "api_key": "le_xxxxxxxxxxxxxxxxxxxxx"
}
```

查看当前用户：

```http
GET /api/users/me
X-API-Key: le_your_api_key
```

查看当前用户的 API Key 列表：

```http
GET /api/users/me/api-keys
X-API-Key: le_your_api_key
```

创建新的 API Key：

```http
POST /api/users/me/api-keys
Content-Type: application/json
X-API-Key: le_your_api_key

{
  "name": "parent-phone"
}
```

撤销 API Key：

```http
DELETE /api/users/me/api-keys/{api_key_id}
X-API-Key: le_your_api_key
```

### 单词管理

创建单词：

```http
POST /api/words
Content-Type: application/json
X-API-Key: le_your_api_key

{
  "word": "apple",
  "translation": "苹果",
  "phonetic": "/ˈæpəl/",
  "dynamic_tags": "Unit1"
}
```

批量导入：

```http
POST /api/words/bulk
Content-Type: application/json
X-API-Key: le_your_api_key

{
  "words": [
    {
      "word": "apple",
      "translation": "苹果",
      "phonetic": "/ˈæpəl/",
      "dynamic_tags": "Unit1"
    },
    {
      "word": "banana",
      "translation": "香蕉",
      "phonetic": "/bəˈnænə/",
      "dynamic_tags": "Unit1"
    }
  ]
}
```

查询单词：

```http
GET /api/words
GET /api/words?tag=Unit1
GET /api/words/{word_id}
```

### 场景生成

```http
POST /api/scenario/generate
Content-Type: application/json
X-API-Key: le_your_api_key

{
  "word_ids": [1, 2, 3]
}
```

返回示例：

```json
{
  "scenario_description": "我们在魔法水果店，正在帮店主找到会唱歌的水果。",
  "ai_role": "Magic Shopkeeper",
  "child_role": "Young Helper",
  "first_question": "Can you find the apple?"
}
```

### 场景对话互动

```http
POST /api/scenario/chat
Content-Type: multipart/form-data
X-API-Key: le_your_api_key
```

表单字段：

- `audio`：孩子的录音文件。
- `history_json`：对话历史 JSON 字符串，默认 `[]`。
- `ai_role`：AI 当前角色，可选。
- `child_role`：孩子当前角色，可选。
- `core_words_json`：核心单词 JSON 字符串，默认 `[]`。

返回：

```json
{
  "transcript": "I want an apple.",
  "ai_reply": "Great! Do you want a red apple or a green apple?"
}
```

### 短文生成

```http
POST /api/story/generate
Content-Type: application/json
X-API-Key: le_your_api_key

{
  "user_id": 1,
  "word_ids": [1, 2, 3]
}
```

返回：

```json
{
  "session_id": 1,
  "standard_text": "Tom has a red apple and a yellow banana..."
}
```

### 背诵评测

```http
POST /api/story/verify?session_id=1
Content-Type: multipart/form-data
X-API-Key: le_your_api_key
```

表单字段：

- `audio`：孩子的背诵录音文件。

返回：

```json
{
  "success": true,
  "verified_index": 5,
  "words_status": [
    {
      "word": "hello",
      "error_type": "None"
    },
    {
      "word": "world",
      "error_type": "Omission"
    }
  ]
}
```

## 注意事项

- 当前项目启动时会自动创建数据库表，适合早期开发和测试。
- 如果本地已有旧版 SQLite 数据库，启动服务会自动创建新的 `user_api_keys` 表；旧用户需要通过新接口重新创建用户，或后续补一个后台管理脚本为旧用户生成 Key。
- 生产环境建议接入 Alembic 管理数据库迁移。
- DeepSeek、Whisper 和 Azure Speech 都需要有效 API Key。
- 背诵评测优先使用 Azure Speech SDK；没有 Azure Key 时会使用转写降级方案，上传音频建议使用 WAV、MP3、M4A 或 WEBM。
- `study_progress` 数据表已建模，后续可以扩展每日打卡、错词复习和星星奖励逻辑。
