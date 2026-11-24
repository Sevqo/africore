"""Validate one bounded opening-balance CSV in integer minor units."""
import csv
import io
import json
import re
import sys


def parse_opening(text):
    if not isinstance(text, str) or not 0 < len(text) <= 65536:
        raise ValueError("Opening CSV must contain up to 65,536 characters")
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff"), newline=""), strict=True)
    required = ["account_code", "debit_minor", "credit_minor"]
    if reader.fieldnames not in (required, required + ["memo"]):
        raise ValueError("Use account_code,debit_minor,credit_minor and optional memo")
    result = []
    seen = set()
    for row in reader:
        if len(result) >= 200 or None in row or any(value is None for value in row.values()):
            raise ValueError("Opening CSV requires two to 200 complete rows")
        account = row["account_code"].strip().upper()
        if not re.fullmatch(r"[A-Z0-9-]{1,20}", account) or account in seen:
            raise ValueError("Each opening account code must be valid and unique")
        seen.add(account)
        amounts = []
        for name in required[1:]:
            value = row[name].strip() or "0"
            if not re.fullmatch(r"[0-9]{1,12}", value) or int(value) > 100_000_000_000:
                raise ValueError("Debit and credit must be nonnegative integer minor units")
            amounts.append(int(value))
        if bool(amounts[0]) == bool(amounts[1]):
            raise ValueError("Enter a debit or a credit on each opening row")
        memo = row.get("memo", "").strip()
        if len(memo) > 1000:
            raise ValueError("Opening memo exceeds 1,000 characters")
        result.append(dict(account_code=account, debit_minor=amounts[0], credit_minor=amounts[1], memo=memo))
    if len(result) < 2 or sum(row["debit_minor"] for row in result) != sum(row["credit_minor"] for row in result):
        raise ValueError("Opening debits and credits must balance")
    return {"lines": result}


if __name__ == "__main__":
    try:
        print(json.dumps(parse_opening(json.load(sys.stdin)["csv"]), separators=(",", ":")))
    except (ValueError, KeyError, TypeError, csv.Error) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
