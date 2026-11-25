"""Bounded bank CSV parsing and advisory matching, in integer minor units."""

import csv
from datetime import date
import io
import json
import re
import sys


HEADER = ["date", "reference", "description", "amount", "currency"]
MAX_MINOR = 100_000_000_000


def parse_statement(text, currency, digits):
    if not isinstance(text, str) or not 0 < len(text) <= 96_000 or digits not in (0, 2):
        raise ValueError("Invalid statement size or currency precision")
    reader = csv.reader(io.StringIO(text.removeprefix("\ufeff"), newline=""), strict=True)
    if next(reader, None) != HEADER:
        raise ValueError("Expected columns: date,reference,description,amount,currency")
    results = []
    references = set()
    for row_number, columns in enumerate(reader, 2):
        if not columns:
            continue
        if len(results) >= 200 or len(columns) != len(HEADER):
            raise ValueError(f"Unexpected row shape or statement row limit at row {row_number}")
        day, reference, description, amount, row_currency = (value.strip() for value in columns)
        if (not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day)
                or date.fromisoformat(day).isoformat() != day):
            raise ValueError(f"Invalid transaction date on row {row_number}")
        if row_currency != currency:
            raise ValueError(f"Statement currency mismatch on row {row_number}")
        if not reference or len(reference) > 100 or not description or len(description) > 250:
            raise ValueError(f"Invalid reference or description on row {row_number}")
        normalized_ref = reference.casefold()
        if normalized_ref in references:
            raise ValueError(f"Duplicate reference on row {row_number}")
        references.add(normalized_ref)
        if not re.fullmatch(r"-?[0-9]{1,12}(?:\.[0-9]{1,2})?", amount):
            raise ValueError(f"Invalid amount on row {row_number}")
        whole, _, fraction = amount.lstrip("-").partition(".")
        if len(fraction) > digits:
            raise ValueError(f"Too many currency decimal places on row {row_number}")
        minor = int(whole) * 10 ** digits + int(fraction.ljust(digits, "0") or "0")
        if not 0 < minor <= MAX_MINOR:
            raise ValueError(f"Zero or out-of-range amount on row {row_number}")
        results.append({
            "date": day, "reference": reference, "reference_key": normalized_ref,
            "description": description, "amount_minor": -minor if amount.startswith("-") else minor,
        })
    if not results:
        raise ValueError("Statement must contain at least one transaction")
    return {"lines": results}


def rank_matches(line, candidates):
    if len(candidates) > 101:
        raise ValueError("Candidate batch exceeds 101 entries")
    result = []
    for candidate in candidates:
        available = candidate["available_minor"]
        remaining = line["remaining_minor"]
        if available <= 0 or remaining <= 0:
            continue
        exact = available == remaining
        same_ref = line["reference"].casefold() in (
            candidate["reference"].casefold(), candidate["source_id"].casefold(),
            (candidate.get("provider_reference") or "").casefold(),
        )
        days = abs((date.fromisoformat(line["date"]) - date.fromisoformat(candidate["date"])).days)
        reasons = ["Exact remaining amount" if exact else "Partial amount possible"]
        if same_ref:
            reasons.append("Same reference")
        if days == 0:
            reasons.append("Same accounting date")
        elif days <= 7:
            reasons.append("Within seven days")
        score = (45 if exact else 15) + (40 if same_ref else 0) + (15 if days == 0 else 10 if days <= 7 else 0)
        result.append({"id": candidate["id"], "score": score, "reasons": reasons,
                       "suggested_minor": min(available, remaining)})
    return {"matches": sorted(result, key=lambda row: (-row["score"], row["id"]))}


def main():
    try:
        request = json.load(sys.stdin)
        if request["operation"] == "parse":
            result = parse_statement(request["csv"], request["currency"], request["digits"])
        elif request["operation"] == "match":
            result = rank_matches(request["line"], request["candidates"])
        else:
            raise ValueError("Unsupported bank operation")
    except (ValueError, TypeError, KeyError, csv.Error) as error:
        result = {"error": str(error)}
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
