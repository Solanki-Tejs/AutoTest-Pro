import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta
import urllib.error
from services.gemini_service import GeminiKeyManager, VALID_GEMINI_MODELS

def test_gemini_key_manager_initialization():
    mgr = GeminiKeyManager()
    assert len(mgr.keys) > 0
    assert len(mgr.models) == len(VALID_GEMINI_MODELS)
    assert len(mgr.get_candidate_pairs()) > 0

def test_gemini_key_manager_quota_429_disable():
    mgr = GeminiKeyManager()
    key = mgr.keys[0]
    model = mgr.models[0]

    now_before = datetime.now(timezone.utc)
    mgr.mark_quota_exhausted(key, model)

    disabled_until = mgr.disabled_until.get((key, model))
    assert disabled_until is not None
    assert disabled_until > now_before + timedelta(hours=11)
    # Pair should not be available
    assert not mgr._is_model_key_available(key, model, now_before)

def test_gemini_key_manager_temporary_error_rotation():
    mgr = GeminiKeyManager()
    initial_idx = mgr._key_index
    mgr.advance_key()
    assert mgr._key_index != initial_idx or len(mgr.keys) == 1
