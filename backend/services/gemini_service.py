import os
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Tuple, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# Static verified Gemini models list for fast generation & evaluation
# Prioritized by stability, speed, and free-tier quota availability
VALID_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
    "gemma-4-26b-a4b-it",
]

DEFAULT_SEED_KEYS: List[str] = []


class GeminiKeyManager:
    """
    Manages a rolling chain of Gemini API keys across verified models.
    Features:
    - True per-request round-robin key switching.
    - Up to 5 key-switching retries on peak usage / high demand (503).
    - Separation of short RPM burst cooldowns (45s) vs hard daily quota (4h).
    - Per-key model availability tracking (preserves models if only one key gets 404).
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
        for env_var in ["GEMINI_API_KEYS", "GEMINI_API_KEY"]:
            raw_val = os.getenv(env_var, "").strip()
            if raw_val:
                for k in raw_val.split(","):
                    k_clean = k.strip()
                    if k_clean and k_clean not in all_keys:
                        all_keys.append(k_clean)

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

    def advance_key(self):
        """Advances the rolling key pointer to the next key."""
        if self.keys:
            self._key_index = (self._key_index + 1) % len(self.keys)

    def get_candidate_pairs(self) -> List[Tuple[str, str]]:
        """
        Returns list of (key, model) pairs in prioritized rolling order.
        Orders keys starting from the current _key_index for fair distribution.
        """
        now = datetime.now(timezone.utc)
        pairs = []
        num_keys = len(self.keys)
        if num_keys == 0:
            return []

        # Rotate keys starting from current pointer
        start_idx = self._key_index % num_keys
        ordered_keys = self.keys[start_idx:] + self.keys[:start_idx]

        for model in self.models:
            for key in ordered_keys:
                if self._is_model_key_available(key, model, now):
                    pairs.append((key, model))

        return pairs

    def mark_rate_limited(self, key: str, model: str, is_daily_quota: bool = False):
        """
        Marks a (key, model) temporarily rate-limited.
        Short RPM burst limit = 45 seconds cooldown.
        Hard daily quota = 4 hours cooldown.
        """
        duration = timedelta(hours=4) if is_daily_quota else timedelta(seconds=45)
        disable_time = datetime.now(timezone.utc) + duration
        self.disabled_until[(key, model)] = disable_time
        mask_key = key[:6] + "..." + key[-4:] if len(key) > 10 else "***"
        cooldown_str = "4 hours (daily quota)" if is_daily_quota else "45 seconds (RPM limit)"
        print(f"[GeminiService] Rate limit on model '{model}' with key {mask_key}. Cooldown: {cooldown_str}.")

    def mark_permanently_invalid(self, key: str):
        """Marks a key permanently invalid."""
        self.permanently_invalid_keys.add(key)
        mask_key = key[:6] + "..." + key[-4:] if len(key) > 10 else "***"
        print(f"[GeminiService] Key ({mask_key}) rejected as permanently invalid.")

    def mark_model_unsupported_for_key(self, key: str, model: str):
        """Marks model unsupported for this specific key (e.g. 404 for newer keys)."""
        self.disabled_until[(key, model)] = datetime.max.replace(tzinfo=timezone.utc)
        mask_key = key[:6] + "..." + key[-4:] if len(key) > 10 else "***"
        print(f"[GeminiService] Model '{model}' not supported for key {mask_key} (404). Disabled for this key.")

    def generate_content(
        self,
        prompt: str,
        json_schema: Optional[Dict[str, Any]] = None,
        temperature: float = 0.2,
        system_instruction: Optional[str] = None,
        timeout: int = 60,
    ) -> Any:
        """
        Executes generateContent with:
        1. True per-request key rotation.
        2. Peak usage / high demand (503) retry up to 5 times switching keys.
        3. Rate limit (429) rotation with 45s cooldown.
        4. Model fallback cascade.
        """
        # Step 1: Advance key pointer for every new incoming request
        self.advance_key()

        candidate_pairs = self.get_candidate_pairs()
        if not candidate_pairs:
            raise RuntimeError("No active Gemini API keys available (all keys may be in cooldown).")

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

        post_data = json.dumps(payload).encode("utf-8")
        last_error = None

        # Track high demand retries across keys
        peak_demand_retries = 0
        MAX_PEAK_RETRIES = 5

        i = 0
        while i < len(candidate_pairs):
            key, model = candidate_pairs[i]
            i += 1

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
            req = urllib.request.Request(
                url,
                data=post_data,
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
                err_lower = error_body.lower()

                # 1. Peak usage / High Demand (503 / 500 / "high demand" / "spikes in demand")
                # Retry up to 5 times while switching keys
                is_peak_usage = (
                    status_code in (500, 502, 503, 504)
                    or "high demand" in err_lower
                    or "spikes in demand" in err_lower
                    or "temporarily unavailable" in err_lower
                    or "overloaded" in err_lower
                )
                if is_peak_usage:
                    peak_demand_retries += 1
                    mask_key = key[:6] + "..." + key[-4:] if len(key) > 10 else "***"
                    if peak_demand_retries <= MAX_PEAK_RETRIES:
                        print(f"[GeminiService] Model '{model}' peak usage on key {mask_key} ({status_code}). Switching keys (attempt {peak_demand_retries}/{MAX_PEAK_RETRIES})...")
                        self.advance_key()
                        time.sleep(1.0)
                        fresh_pairs = self.get_candidate_pairs()
                        if fresh_pairs:
                            candidate_pairs = fresh_pairs
                            i = 0
                        continue
                    else:
                        print(f"[GeminiService] Peak usage retry limit ({MAX_PEAK_RETRIES}) reached for model '{model}'. Falling back to next model.")
                        continue

                # 2. 429 Rate Limit: Distinguish daily quota vs momentary RPM
                if status_code == 429 or "resource_exhausted" in err_lower or "quota" in err_lower:
                    is_daily = "per day" in err_lower or "daily" in err_lower or "quota_limit_value_daily" in err_lower
                    self.mark_rate_limited(key, model, is_daily_quota=is_daily)
                    self.advance_key()
                    continue

                # 3. 400 with INVALID_API_KEY or 403 Forbidden
                if status_code in (400, 403) and ("api_key_invalid" in err_lower or "forbidden" in err_lower):
                    self.mark_permanently_invalid(key)
                    self.advance_key()
                    continue

                # 4. 404: Model not found or deprecated for this specific key
                if status_code == 404:
                    self.mark_model_unsupported_for_key(key, model)
                    self.advance_key()
                    continue

                print(f"[GeminiService] HTTP {status_code} on model '{model}': {error_body}")
                self.advance_key()
                continue

            except Exception as e:
                last_error = str(e)
                print(f"[GeminiService] Exception with model '{model}': {e}. Rotating to next option.")
                self.advance_key()
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
