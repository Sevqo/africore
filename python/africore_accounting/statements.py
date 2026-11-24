"""Exact integer-minor-unit financial statement aggregation and reconciliation."""
import json
import sys


def _require_int(value, field):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be an integer minor unit")
    return value


def summarize_statement(payload):
    if not isinstance(payload, dict):
        raise ValueError("Statement payload must be an object")
    rows = payload.get("rows")
    if not isinstance(rows, list) or len(rows) > 5000:
        raise ValueError("Statement rows must be a list of at most 5,000 accounts")

    valid_types = {"asset", "liability", "equity", "revenue", "expense"}
    debit_total = 0
    credit_total = 0
    opening_debit_total = 0
    opening_credit_total = 0
    assets = 0
    liabilities_debit = 0
    equity_debit = 0
    current_year_result = 0
    results_closing = 0
    net_profit = 0
    revenue = 0
    cost_of_sales = 0
    operating_expenses = 0
    has_cost_of_sales = False

    category_order = []
    category_balance = {}
    category_profit = {}

    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Each account row must be an object")
        acc_type = row.get("type")
        if acc_type not in valid_types:
            raise ValueError(f"Unsupported account type: {acc_type}")
        category = str(row.get("category") or acc_type)
        selected = bool(row.get("selected", True))

        opening_debit = _require_int(row.get("opening_debit_minor", 0), "opening_debit_minor")
        opening_credit = _require_int(row.get("opening_credit_minor", 0), "opening_credit_minor")
        debit = _require_int(row.get("debit_minor", 0), "debit_minor")
        credit = _require_int(row.get("credit_minor", 0), "credit_minor")
        fiscal_result = _require_int(row.get("fiscal_result_minor", 0), "fiscal_result_minor")
        closing = _require_int(row.get("closing_minor", 0), "closing_minor")
        movement = _require_int(row.get("movement_minor", debit - credit), "movement_minor")

        if opening_debit < 0 or opening_credit < 0 or debit < 0 or credit < 0:
            raise ValueError("Account debit and credit totals must be nonnegative")
        if movement != debit - credit:
            raise ValueError("Account movement does not match debit minus credit")

        debit_total += debit
        credit_total += credit
        opening_debit_total += opening_debit
        opening_credit_total += opening_credit

        if acc_type == "asset":
            assets += closing
        elif acc_type == "liability":
            liabilities_debit += closing
        elif acc_type == "equity":
            equity_debit += closing
        elif acc_type in ("revenue", "expense"):
            current_year_result += fiscal_result
            results_closing += closing
            net_profit += -movement
            if acc_type == "revenue":
                revenue += -movement
            elif category == "cost_of_sales":
                has_cost_of_sales = True
                cost_of_sales += movement
            else:
                operating_expenses += movement

        if selected:
            if category not in category_balance:
                category_order.append(category)
                category_balance[category] = 0
                category_profit[category] = 0
            category_balance[category] += closing if acc_type == "asset" else -closing
            category_profit[category] += -movement

    liabilities = -liabilities_debit
    posted_equity = -equity_debit
    retained_earnings = -results_closing - current_year_result
    equity = posted_equity + retained_earnings + current_year_result
    equation_variance = assets - liabilities - equity
    gross_profit = revenue - cost_of_sales

    categories = [
        {
            "category": cat,
            "balance_minor": category_balance[cat],
            "profit_minor": category_profit[cat],
        }
        for cat in category_order
    ]

    return {
        "categories": categories,
        "totals": {
            "debit_minor": debit_total,
            "credit_minor": credit_total,
            "balanced": debit_total == credit_total,
            "opening_debit_minor": opening_debit_total,
            "opening_credit_minor": opening_credit_total,
            "assets_minor": assets,
            "liabilities_minor": liabilities,
            "posted_equity_minor": posted_equity,
            "retained_earnings_minor": retained_earnings,
            "current_year_result_minor": current_year_result,
            "equity_minor": equity,
            "equation_variance_minor": equation_variance,
            "revenue_minor": revenue,
            "cost_of_sales_minor": cost_of_sales,
            "has_cost_of_sales": has_cost_of_sales,
            "gross_profit_minor": gross_profit,
            "operating_expenses_minor": operating_expenses,
            "net_profit_minor": net_profit,
        },
    }


if __name__ == "__main__":
    try:
        print(json.dumps(summarize_statement(json.load(sys.stdin)), separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
