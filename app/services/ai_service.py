import json
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.db.models import Word


SCENARIO_SYSTEM_PROMPT = """
You are a patient and fun native English teacher for 10-year-old Chinese children (Grade 4). 
Your task is to create a vivid and simple dialogue scenario based on the given [Core Word List].
You must strictly return a JSON object (do not include markdown blocks like ```json) with the following keys:
- scenario_description: A fun description of the situation in Chinese (e.g., "我们在魔法宠物店...").
- ai_role: The character you will play (e.g., "Wizard Shopkeeper").
- child_role: The character the child will play (e.g., "Young Apprentice").
- first_question: Your first engaging OPEN question in English, which MUST clearly fit the scenario_description and ai_role. It MUST use at least one core word and ask the child to describe, choose with a reason, solve a small problem, or make a plan inside the scenario. Avoid yes/no questions. Prefer questions starting with What, Where, How, Why, or Tell me. Keep sentences simple and vocabulary appropriate for Grade 4.
""".strip()


STORY_SYSTEM_PROMPT = """
You are a children's textbook author. Write a short, engaging story (40-60 words) for a 4th-grade student.
Requirements:
1. It MUST naturally include all the words in the provided [Core Word List].
2. Use simple sentence structures (avoid complex subordinate clauses).
3. The tone should be joyful, humorous, or adventurous.
4. The story must contain no more than 5 sentences.
5. Output ONLY the raw English text of the story, no translations, no explanations.
""".strip()


CHAT_SYSTEM_PROMPT = """
You are a patient and fun English conversation partner for a Grade 4 Chinese child.
Stay in your role and use short Grade-4-level English sentences.
Do not ask boring yes/no questions unless absolutely necessary.
Ask exactly one open follow-up question that invites the child to answer with a full sentence.
Prefer "What...", "Where...", "How...", "Why...", "Which...", or "Tell me..." questions.
The question must logically continue the current scenario and role play. Do not suddenly change topic.
If the child gives a very short answer, gently model a better full-sentence answer first, then ask the next open question.
Naturally reuse the core words when possible.
Return only the next English sentence or question. Do not return JSON.
""".strip()


WORD_ENRICH_SYSTEM_PROMPT = """
You are an elementary English vocabulary assistant.
Return ONLY a JSON object with key "words".
"words" must be an array. Each item must contain:
- word: the original English word
- translation: a short Simplified Chinese meaning for a Grade 4 child
- phonetic: a simple IPA phonetic string if you know it, otherwise empty string
- is_valid: true only if it is a real common English word suitable for a child vocabulary list
- reason: short Simplified Chinese reason when invalid, otherwise empty string
Do not include markdown.
""".strip()


class AIService:
    def __init__(self) -> None:
        settings = get_settings()
        api_key, base_url, model = self._resolve_provider_settings(settings)
        self.settings = settings
        self.model = model
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def generate_scenario(self, words: list[Word]) -> dict[str, str]:
        core_words = [word.word for word in words]
        response = await self.client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SCENARIO_SYSTEM_PROMPT},
                {"role": "user", "content": f"[Core Word List]: {', '.join(core_words)}"},
            ],
            temperature=0.7,
        )
        content = response.choices[0].message.content or "{}"
        return self._parse_json_object(content)

    async def generate_story(self, words: list[Word]) -> str:
        core_words = [word.word for word in words]
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": STORY_SYSTEM_PROMPT},
                {"role": "user", "content": f"[Core Word List]: {', '.join(core_words)}"},
            ],
            temperature=0.8,
        )
        return (response.choices[0].message.content or "").strip()

    async def enrich_words(self, words: list[str]) -> dict[str, dict[str, str]]:
        response = await self.client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": WORD_ENRICH_SYSTEM_PROMPT},
                {"role": "user", "content": f"Words: {', '.join(words)}"},
            ],
            temperature=0.2,
        )
        content = response.choices[0].message.content or "{}"
        parsed = self._parse_json_object(content)
        result: dict[str, dict[str, str]] = {}
        for item in parsed.get("words", []):
            word = str(item.get("word", "")).strip()
            if word:
                result[word.lower()] = {
                    "translation": str(item.get("translation", "")).strip(),
                    "phonetic": str(item.get("phonetic", "")).strip(),
                    "is_valid": bool(item.get("is_valid", True)),
                    "reason": str(item.get("reason", "")).strip(),
                }
        return result

    async def continue_scenario_chat(
        self,
        transcript: str,
        history: list[dict[str, str]],
        ai_role: str | None = None,
        child_role: str | None = None,
        core_words: list[str] | None = None,
    ) -> str:
        context = {
            "ai_role": ai_role,
            "child_role": child_role,
            "core_words": core_words or [],
        }
        messages: list[dict[str, str]] = [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": f"Conversation context: {json.dumps(context, ensure_ascii=False)}"},
        ]
        messages.extend(history)
        messages.append({"role": "user", "content": transcript})

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.7,
        )
        return (response.choices[0].message.content or "").strip()

    @staticmethod
    def _parse_json_object(content: str) -> dict[str, Any]:
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ValueError(f"LLM provider returned invalid JSON: {content}") from exc
        if not isinstance(parsed, dict):
            raise ValueError("DeepSeek response must be a JSON object.")
        return parsed

    @staticmethod
    def _resolve_provider_settings(settings) -> tuple[str, str, str]:
        providers = {
            "deepseek": (settings.deepseek_api_key, settings.deepseek_base_url, settings.deepseek_model),
            "siliconflow": (settings.siliconflow_api_key, settings.siliconflow_base_url, settings.siliconflow_model),
            "qwen": (settings.qwen_api_key, settings.qwen_base_url, settings.qwen_model),
            "openrouter": (settings.openrouter_api_key, settings.openrouter_base_url, settings.openrouter_model),
        }
        api_key, base_url, model = providers[settings.llm_provider]
        if not api_key:
            raise RuntimeError(f"{settings.llm_provider.upper()}_API_KEY is not configured.")
        return api_key, base_url, model
