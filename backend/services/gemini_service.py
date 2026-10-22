import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Tuple, Any, Optional

# Static verified Gemini models list for fast generation & evaluation
VALID_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
]

DEFAULT_SEED_KEYS: List[str] = []


class GeminiKeyManager:
    """
    Manages a rolling chain of Gemini API keys across valid generation models.
    Handles quota blocks (12-hour disable per model), temporary outages (immediate rotation),
    and seamless fallback to local Ollama.
    """

    def __init__(self):
        self.keys: List[str] = []
        self._key_index: int = 0
        # Tracks (key, model) -> disabled_until datetime
        self.disabled_until: Dict[Tuple[str, str], datetime] = {}
        # Permanently invalid keys
        self.permanently_invalid_keys: set[str] = set()
        self.models: List[str] = list(VALID_GEMINI_MODELS)
        self.refresh_keys()

    def refresh_keys(self):
        """Loads and deduplicates API keys from environment and seed list."""
        all_keys = []

        # 1. Parse keys from GEMINI_API_KEYS and GEMINI_API_KEY (supports comma-separated multi-account lists)
        for env_var in ["GEMINI_API_KEYS", "GEMINI_API_KEY"]:
            raw_val = os.getenv(env_var, "").strip()
            if raw_val:
                for k in raw_val.split(","):
                    k_clean = k.strip()
                    if k_clean and k_clean not in all_keys:
                        all_keys.append(k_clean)

        # 2. Seed keys
        for sk in DEFAULT_SEED_KEYS:
            sk_clean = sk.strip()
            if sk_clean and sk_clean not in all_keys:
                all_keys.append(sk_clean)

        self.keys = all_keys
        print(f"[GeminiService] Initialized with {len(self.keys)} API key(s) and {len(self.models)} verified model(s).")

    def _is_model_key_available(self, key: str, model: str, now: datetime) -> bool:
        if key in self.permanently_invalid_keys:
            return False
        until = self.disabled_until.get((key, model))
        if until and now < until:
            return False
        return True

    def get_candidate_pairs(self) -> List[Tuple[str, str]]:
        """Returns list of (key, model) pairs in prioritized rolling order."""
        now = datetime.now(timezone.utc)
        pairs = []
        num_keys = len(self.keys)
        if num_keys == 0:
            return []

        # Rotate starting key index
        start_idx = self._key_index % num_keys
        ordered_keys = self.keys[start_idx:] + self.keys[:start_idx]

        for model in self.models:
            for key in ordered_keys:
                if self._is_model_key_available(key, model, now):
                    pairs.append((key, model))

        return pairs

    def mark_quota_exhausted(self, key: str, model: str):
        """Disables the specific key for this model for 12 hours."""
        disable_time = datetime.now(timezone.utc) + timedelta(hours=12)
        self.disabled_until[(key, model)] = disable_time
        mask_key = key[:8] + "..." if len(key) > 8 else "***"
        print(f"[GeminiService] Quota limit reached for key ({mask_key}) on model '{model}'. Disabled for 12 hours until {disable_time.isoformat()}.")

    def mark_permanently_invalid(self, key: str):
        """Marks a key permanently invalid."""
        self.permanently_invalid_keys.add(key)
        mask_key = key[:8] + "..." if len(key) > 8 else "***"
        print(f"[GeminiService] Key ({mask_key}) rejected as permanently invalid.")

    def advance_key(self):
        """Advances the rolling key pointer."""
        if self.keys:
            self._key_index = (self._key_index + 1) % len(self.keys)

    def generate_content(
        self,
        prompt: str,
        json_schema: Optional[Dict[str, Any]] = None,
        temperature: float = 0.2,
        system_instruction: Optional[str] = None,
        timeout: int = 60,
    ) -> Any:
        """
        Executes generateContent across rolling keys and models with intelligent error handling.
        Returns parsed JSON dict if schema provided, or string text.
        Raises RuntimeError if all Gemini attempts fail.
        """
        candidate_pairs = self.get_candidate_pairs()
        if not candidate_pairs:
            raise RuntimeError("No active Gemini API keys available (all keys may be disabled or quota-exhausted).")

        last_error = None

        for key, model in candidate_pairs:
            self.advance_key()
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

            payload: Dict[str, Any] = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": temperature,
                },
            }

            if json_schema:
                payload["generationConfig"]["responseMimeType"] = "application/json"
                payload["generationConfig"]["responseSchema"] = json_schema

            if system_instruction:
                payload["systemInstruction"] = {
                    "parts": [{"text": system_instruction}]
                }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    res_body = json.loads(response.read().decode("utf-8"))
                    candidates = res_body.get("candidates", [])
                    if not candidates:
                        raise ValueError("Empty candidate response from Gemini")

                    parts = candidates[0].get("content", {}).get("parts", [])
                    raw_text = parts[0].get("text", "") if parts else ""

                    if json_schema:
                        try:
                            return json.loads(raw_text)
                        except json.JSONDecodeError:
                            # Try to extract JSON substring if fenced
                            cleaned = raw_text.strip()
                            if cleaned.startswith("```json"):
                                cleaned = cleaned[7:]
                            if cleaned.startswith("```"):
                                cleaned = cleaned[3:]
                            if cleaned.endswith("```"):
                                cleaned = cleaned[:-3]
                            return json.loads(cleaned.strip())
                    return raw_text

            except urllib.error.HTTPError as he:
                error_body = ""
                try:
                    error_body = he.read().decode("utf-8")
                except Exception:
                    pass

                status_code = he.code
                last_error = f"HTTP {status_code}: {error_body or he.reason}"

                # Classify error:
                # 1. 429: Too Many Requests / Quota Exceeded -> Disable for 12 hours
                if status_code == 429 or "RESOURCE_EXHAUSTED" in error_body or "quota" in error_body.lower():
                    self.mark_quota_exhausted(key, model)
                    continue

                # 2. 400 with INVALID_API_KEY or 403 Forbidden -> Mark invalid
                if status_code in (400, 403) and ("API_KEY_INVALID" in error_body or "forbidden" in error_body.lower()):
                    self.mark_permanently_invalid(key)
                    continue

                # 3. 503 / 500 / Overloaded / Temporary Unavailable -> Rotate, don't disable
                if status_code in (500, 502, 503, 504) or "temporarily unavailable" in error_body.lower():
                    print(f"[GeminiService] Temporary error on model '{model}' ({status_code}). Rotating to next key/model.")
                    continue

                # 404: Model not found or deprecated -> Remove model from priority
                if status_code == 404:
                    if model in self.models:
                        self.models.remove(model)
                    print(f"[GeminiService] Model '{model}' not found. Removed from active list.")
                    continue

                print(f"[GeminiService] Non-retryable HTTP error on model '{model}': {status_code} - {error_body}")
                continue

            except Exception as e:
                last_error = str(e)
                print(f"[GeminiService] Network/timeout exception with model '{model}': {e}. Rotating to next option.")
                continue

        raise RuntimeError(f"All Gemini models and keys exhausted. Last error: {last_error}")


# Singleton instance
gemini_manager = GeminiKeyManager()


def generate_with_gemini(
    prompt: str,
    json_schema: Optional[Dict[str, Any]] = None,
    temperature: float = 0.2,
    system_instruction: Optional[str] = None,
    timeout: int = 60,
) -> Any:
    """Helper function to execute generation using the rolling key manager."""
    return gemini_manager.generate_content(
        prompt=prompt,
        json_schema=json_schema,
        temperature=temperature,
        system_instruction=system_instruction,
        timeout=timeout,
    )
