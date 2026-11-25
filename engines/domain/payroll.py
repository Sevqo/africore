"""Exact integer-minor-unit progressive gross-to-net payroll calculation engine."""
from fractions import Fraction
import json
import sys


def _req_int(value, name):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    return value


def _round_half_up(frac):
    if frac >= 0:
        return (frac.numerator * 2 + frac.denominator) // (2 * frac.denominator)
    return -((-frac.numerator * 2 + frac.denominator) // (2 * frac.denominator))


def calculate_payroll(payload):
    if not isinstance(payload, dict):
        raise ValueError("Payroll payload must be an object")
    brackets = payload.get("tax_brackets", [])
    employees = payload.get("employees")
    if not isinstance(brackets, list) or len(brackets) > 20:
        raise ValueError("tax_brackets must be a list of at most 20 tiers")
    if not isinstance(employees, list) or not 1 <= len(employees) <= 500:
        raise ValueError("employees must be a list of 1 to 500 records")

    parsed_brackets = []
    prev_upper = 0
    for b in brackets:
        upper = b.get("up_to_minor")
        rate_bps = _req_int(b.get("rate_bps", 0), "rate_bps")
        if not 0 <= rate_bps <= 10000:
            raise ValueError("Bracket rate_bps must be 0..10000")
        if upper is not None:
            upper = _req_int(upper, "up_to_minor")
            if upper <= prev_upper:
                raise ValueError("Tax bracket up_to_minor values must strictly increase")
            prev_upper = upper
        parsed_brackets.append((upper, rate_bps))

    payslips = []
    total_gross = 0
    total_tax = 0
    total_deductions = 0
    total_net = 0

    for emp in employees:
        emp_id = str(emp.get("employee_id") or "")
        name = str(emp.get("name") or "")
        base = _req_int(emp.get("base_salary_minor", 0), "base_salary_minor")
        allowances = _req_int(emp.get("allowances_minor", 0), "allowances_minor")
        pre_tax_ded = _req_int(emp.get("pre_tax_deductions_minor", 0), "pre_tax_deductions_minor")
        post_tax_ded = _req_int(emp.get("post_tax_deductions_minor", 0), "post_tax_deductions_minor")
        relief = _req_int(emp.get("tax_relief_minor", 0), "tax_relief_minor")
        if any(v < 0 for v in (base, allowances, pre_tax_ded, post_tax_ded, relief)):
            raise ValueError("Payroll amounts must be nonnegative")

        gross = base + allowances
        taxable = max(0, gross - pre_tax_ded)
        raw_tax = 0
        lower = 0
        for upper, rate_bps in parsed_brackets:
            if taxable <= lower:
                break
            slice_top = taxable if upper is None else min(taxable, upper)
            band = max(0, slice_top - lower)
            raw_tax += _round_half_up(Fraction(band * rate_bps, 10000))
            if upper is None:
                break
            lower = upper
        tax = max(0, raw_tax - relief)
        deductions = pre_tax_ded + tax + post_tax_ded
        net = max(0, gross - deductions)

        total_gross += gross
        total_tax += tax
        total_deductions += deductions
        total_net += net
        payslips.append(
            {
                "employee_id": emp_id,
                "name": name,
                "gross_minor": gross,
                "taxable_minor": taxable,
                "tax_minor": tax,
                "total_deductions_minor": deductions,
                "net_pay_minor": net,
            }
        )

    return {
        "totals": {
            "gross_minor": total_gross,
            "tax_minor": total_tax,
            "total_deductions_minor": total_deductions,
            "net_pay_minor": total_net,
        },
        "payslips": payslips,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(calculate_payroll(json.load(sys.stdin)), separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
