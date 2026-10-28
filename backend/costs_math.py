from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal("0.01")


def _money(value):
    return float(Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP))


def calculate_production_cost(quantity_produced, selling_price_per_unit, cost_items):
    normalized_items = []
    total = Decimal("0")
    for item in cost_items:
        quantity = Decimal(str(item["quantity"]))
        unit_cost = Decimal(str(item["unit_cost"]))
        line_total = (quantity * unit_cost).quantize(CENT, rounding=ROUND_HALF_UP)
        total += line_total
        normalized_items.append({
            **item,
            "quantity": float(quantity),
            "unit_cost": float(unit_cost),
            "total_cost": float(line_total),
        })

    total = total.quantize(CENT, rounding=ROUND_HALF_UP)
    produced = Decimal(str(quantity_produced))
    selling_price = Decimal(str(selling_price_per_unit))
    cost_per_unit = total / produced
    profit_per_unit = selling_price - cost_per_unit
    revenue_if_all_sold = selling_price * produced
    total_profit_if_all_sold = revenue_if_all_sold - total
    margin_percent = (
        (total_profit_if_all_sold / revenue_if_all_sold) * Decimal("100")
        if revenue_if_all_sold else None
    )

    return {
        "cost_items": normalized_items,
        "total_production_cost": float(total),
        "cost_per_unit": float(cost_per_unit),
        "selling_price_per_unit": _money(selling_price),
        "profit_per_unit": _money(profit_per_unit),
        "revenue_if_all_sold": _money(revenue_if_all_sold),
        "total_profit_if_all_sold": _money(total_profit_if_all_sold),
        "gross_margin_percent": float(margin_percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        if margin_percent is not None else None,
    }
