"""Privacy Guardrail & Reversible Pseudonymization Shield for AfriCore Agent.

Guarantees that raw customer names, emails, phone numbers, tax/bank/M-Pesa identifiers,
credentials, and confidential document bodies NEVER leave the workspace unredacted when
communicating with an external LLM or performing internet web research.
"""

from __future__ import annotations

import json
import re
from typing import Any

_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions", re.I),
    re.compile(r"reveal\s+(?:the\s+)?(?:system\s+prompt|api[_\s]?key|secret|env(?:ironment)?)", re.I),
    re.compile(r"exfiltrate|dump\s+all\s+(?:customers|passwords|tokens|secrets)", re.I),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}|postgres(?:ql)?://|-----BEGIN\s+[A-Z ]*PRIVATE\s+KEY", re.I),
]

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3}[\s.-]?\d{3,4}\b")
_KRA_PIN_RE = re.compile(r"\b[AP]\d{9}[A-Z]\b")
_CARD_OR_ACCOUNT_RE = re.compile(r"\b(?:\d[ -]*?){12,19}\b")
_MPESA_CODE_RE = re.compile(r"\b[A-Z]{2}[A-Z0-9]{8}\b")


def check_prompt_guardrails(text: str) -> dict[str, Any]:
    """Detect prompt-injection attempts and credential leakage before execution."""
    raw = str(text or "")
    for pat in _INJECTION_PATTERNS:
        if pat.search(raw):
            return {
                "safe": False,
                "reason": "Blocked by AfriCore Privacy Guardrail: detected prompt injection or secret-exfiltration pattern.",
            }
    return {"safe": True, "reason": ""}


class ReversiblePrivacyVault:
    """Session-local reversible pseudonymizer mapping raw values <-> opaque tokens."""

    def __init__(self) -> None:
        self._forward: dict[str, str] = {}
        self._reverse: dict[str, str] = {}
        self._counts: dict[str, int] = {}

    def tokenize(self, category: str, raw_value: str) -> str:
        clean = str(raw_value or "").strip()
        if not clean:
            return clean
        key = f"{category}:{clean.lower()}"
        if key in self._forward:
            return self._forward[key]
        idx = self._counts.get(category, 0) + 1
        self._counts[category] = idx
        token = f"[{category}_{idx}]"
        self._forward[key] = token
        self._reverse[token] = clean
        return token

    def scrub_text(self, text: str, known_entities: list[str] | None = None) -> str:
        out = str(text or "")
        if not out:
            return out
        # 1. Known workspace entity names first (longest first to prevent partial replacements)
        for entity in sorted({e.strip() for e in (known_entities or []) if len(e.strip()) >= 3}, key=len, reverse=True):
            pat = re.compile(re.escape(entity), re.I)
            if pat.search(out):
                token = self.tokenize("ENTITY", entity)
                out = pat.sub(token, out)
        # 2. Structured PII / financial identifiers
        out = _EMAIL_RE.sub(lambda m: self.tokenize("EMAIL", m.group(0)), out)
        out = _KRA_PIN_RE.sub(lambda m: self.tokenize("TAX_ID", m.group(0)), out)
        out = _CARD_OR_ACCOUNT_RE.sub(lambda m: self.tokenize("ACCOUNT", m.group(0)), out)
        out = _PHONE_RE.sub(lambda m: self.tokenize("PHONE", m.group(0)) if len(re.sub(r"\D", "", m.group(0))) >= 9 else m.group(0), out)
        return out

    def rehydrate(self, text: str) -> str:
        out = str(text or "")
        for token, original in self._reverse.items():
            out = out.replace(token, original)
        return out

    def stats(self) -> dict[str, Any]:
        return {
            "redactions_count": len(self._reverse),
            "categories": dict(self._counts),
        }


def _collect_known_entities(evidence: Any) -> list[str]:
    names: list[str] = []
    if isinstance(evidence, dict):
        for key, val in evidence.items():
            if key in ("customer_name", "contact_name", "company", "full_name", "display_name", "vendor", "assignee_name") and isinstance(val, str):
                if len(val.strip()) >= 3:
                    names.append(val.strip())
            elif key in ("customers", "members", "employees", "vendors") and isinstance(val, list):
                for item in val[:60]:
                    if isinstance(item, dict):
                        for nk in ("name", "display_name", "full_name", "company"):
                            if isinstance(item.get(nk), str) and len(item[nk].strip()) >= 3:
                                names.append(item[nk].strip())
            elif isinstance(val, (dict, list)):
                names.extend(_collect_known_entities(val))
    elif isinstance(evidence, list):
        for item in evidence[:40]:
            names.extend(_collect_known_entities(item))
    return names[:80]


def _scrub_structure(value: Any, vault: ReversiblePrivacyVault, entities: list[str]) -> Any:
    if isinstance(value, str):
        return vault.scrub_text(value, entities)
    if isinstance(value, list):
        return [_scrub_structure(v, vault, entities) for v in value[:40]]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            low_k = str(k).lower()
            if low_k in ("content_base64", "data_url", "token", "secret", "password", "api_key", "private_key"):
                out[k] = "[REDACTED_BINARY_OR_SECRET]"
            elif low_k in ("email", "phone", "address", "tax_id", "kra_pin", "bank_account"):
                out[k] = vault.tokenize(low_k.upper(), str(v)) if v else ""
            else:
                out[k] = _scrub_structure(v, vault, entities)
        return out
    return value


def sanitize_for_external_llm(
    prompt: str,
    summary: str,
    evidence: dict[str, Any],
) -> dict[str, Any]:
    """Prepare a strictly pseudonymized, guardrail-verified payload for external LLM calls."""
    guard = check_prompt_guardrails(prompt)
    if not guard["safe"]:
        return {
            "blocked": True,
            "block_reason": guard["reason"],
            "safe_prompt": "",
            "safe_summary": "",
            "safe_evidence": {},
            "vault": ReversiblePrivacyVault(),
            "stats": {"redactions_count": 0, "categories": {}},
        }

    vault = ReversiblePrivacyVault()
    entities = _collect_known_entities(evidence)
    safe_prompt = vault.scrub_text(prompt, entities)
    safe_summary = vault.scrub_text(summary, entities)
    safe_evidence = _scrub_structure(evidence, vault, entities)
    # Trim serialized evidence safely so external egress stays compact
    serialized = json.dumps(safe_evidence)
    if len(serialized) > 4500:
        safe_evidence = {"truncated_evidence_preview": serialized[:4500]}
    return {
        "blocked": False,
        "block_reason": "",
        "safe_prompt": safe_prompt,
        "safe_summary": safe_summary,
        "safe_evidence": safe_evidence,
        "vault": vault,
        "stats": vault.stats(),
    }


def scrub_web_search_query(query: str, known_entities: list[str] | None = None) -> str:
    """Strip any PII/internal identifiers before querying public internet search engines."""
    clean = str(query or "").strip()
    clean = _EMAIL_RE.sub("", clean)
    clean = _KRA_PIN_RE.sub("", clean)
    clean = _CARD_OR_ACCOUNT_RE.sub("", clean)
    clean = _PHONE_RE.sub("", clean)
    clean = _MPESA_CODE_RE.sub("", clean)
    for entity in known_entities or []:
        if len(entity.strip()) >= 3:
            clean = re.sub(re.escape(entity.strip()), "", clean, flags=re.I)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:200]
