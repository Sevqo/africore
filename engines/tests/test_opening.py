import csv
import unittest

from domain.opening import parse_opening


class OpeningTests(unittest.TestCase):
    def test_balanced_exact_minor_units_and_quoted_memo(self):
        result = parse_opening(
            '\ufeffaccount_code,debit_minor,credit_minor,memo\n1000,12345,0,"Opening, cash"\n3000,,12345,Equity'
        )
        self.assertEqual(result["lines"][0]["debit_minor"], 12345)
        self.assertEqual(result["lines"][0]["memo"], "Opening, cash")

    def test_invalid_and_duplicate_rows(self):
        for text in (
            "1000,12,0\n1000,0,12",
            "1000,12.5,0\n3000,0,12",
            "1000,12,0\n3000,0,10",
            "1000,0,0\n3000,0,10",
            "1000,-12,0\n3000,0,12",
            "1000,12,0,unexpected\n3000,0,12",
        ):
            with self.subTest(text=text), self.assertRaises((ValueError, csv.Error)):
                parse_opening("account_code,debit_minor,credit_minor\n" + text)
