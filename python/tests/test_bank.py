import unittest

from africore_accounting.bank import parse_statement, rank_matches


class BankStatementTests(unittest.TestCase):
    header = "date,reference,description,amount,currency\n"

    def test_signed_amounts_quoted_fields_and_bom(self):
        result = parse_statement(
            "\ufeff" + self.header
            + '2026-11-04,A1,"Cash, deposit",1.25,KES\n'
            + "2026-11-05,A2,Cash out,-0.01,KES\n", "KES", 2,
        )
        self.assertEqual([line["amount_minor"] for line in result["lines"]], [125, -1])
        self.assertEqual(result["lines"][0]["description"], "Cash, deposit")

    def test_duplicate_and_bad_currency_precision_are_rejected(self):
        row = "2026-11-04,REF,Deposit,1,KES\n"
        for body, currency, digits in (
            (row + row.replace("REF", "ref"), "KES", 2),
            (row, "USD", 2),
            (row.replace(",1,KES", ",1.01,UGX"), "UGX", 0),
            (row.replace("11-04", "02-30"), "KES", 2),
            (row.replace(",1,KES", ",0,KES"), "KES", 2),
            (row * 201, "KES", 2),
        ):
            with self.subTest(body=body[:40], currency=currency), self.assertRaises(ValueError):
                parse_statement(self.header + body, currency, digits)

    def test_rank_prefers_exact_reference_with_same_amount_and_date(self):
        line = {"reference": "BANK-234", "date": "2026-11-04", "remaining_minor": 100}
        shared = {"reference": "JOURNAL", "source_id": "A-01", "date": line["date"]}
        result = rank_matches(line, [
            {**shared, "id": "partial", "available_minor": 25},
            {**shared, "id": "exhausted", "available_minor": 0},
            {**shared, "id": "exact", "available_minor": 100, "provider_reference": "bank-234"},
        ])["matches"]
        self.assertEqual([(c["id"], c["suggested_minor"]) for c in result], [("exact", 100), ("partial", 25)])
        self.assertEqual(result[0]["score"], 100)
