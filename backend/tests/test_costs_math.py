from costs_math import calculate_production_cost


def test_block_cost_and_selling_price_calculates_expected_profit():
    result = calculate_production_cost(
        1,
        2500,
        [
            {"description": "Chemical A", "quantity": 2, "unit": "L", "unit_cost": 700},
            {"description": "Chemical B", "quantity": 1, "unit": "L", "unit_cost": 600},
        ],
    )

    assert result["total_production_cost"] == 2000
    assert result["cost_per_unit"] == 2000
    assert result["selling_price_per_unit"] == 2500
    assert result["profit_per_unit"] == 500
    assert result["total_profit_if_all_sold"] == 500
    assert result["gross_margin_percent"] == 20


def test_quantity_produced_calculates_batch_and_unit_profit():
    result = calculate_production_cost(
        4,
        2500,
        [{"description": "Chemicals", "quantity": 1, "unit": "batch", "unit_cost": 8000}],
    )

    assert result["cost_per_unit"] == 2000
    assert result["profit_per_unit"] == 500
    assert result["revenue_if_all_sold"] == 10000
    assert result["total_profit_if_all_sold"] == 2000
