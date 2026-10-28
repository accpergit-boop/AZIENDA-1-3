from datetime import date, timedelta

from salary_math import calculate_salary_hours


def test_five_present_days_make_a_45_hour_base_week():
    monday = date(2026, 10, 26)
    records = [
        {"date": (monday + timedelta(days=day)).isoformat(), "status": "Present"}
        for day in range(5)
    ]

    result = calculate_salary_hours(records)

    assert sum(day["regular_hours"] for day in result) == 45
    assert sum(day["overtime_hours"] for day in result) == 0


def test_saturday_hours_after_five_full_days_are_overtime():
    monday = date(2026, 10, 26)
    records = [
        {"date": (monday + timedelta(days=day)).isoformat(), "status": "Present"}
        for day in range(5)
    ]
    records.append({
        "date": (monday + timedelta(days=5)).isoformat(),
        "status": "Present",
        "start_time": "08:00",
        "end_time": "13:00",
    })

    result = calculate_salary_hours(records)

    assert sum(day["regular_hours"] for day in result) == 45
    assert sum(day["overtime_hours"] for day in result) == 5


def test_saved_times_are_used_instead_of_default_hours_or_manual_overtime():
    result = calculate_salary_hours([{
        "date": "2026-10-26",
        "status": "Present",
        "start_time": "08:00",
        "end_time": "13:00",
        "overtime_hours": 2,
    }])

    assert result[0]["regular_hours"] == 5
    assert result[0]["overtime_hours"] == 0


def test_half_day_without_times_defaults_to_four_and_a_half_hours():
    result = calculate_salary_hours([{"date": "2026-10-26", "status": "Half Day"}])

    assert result[0]["regular_hours"] == 4.5
    assert result[0]["overtime_hours"] == 0


def test_saturday_without_times_defaults_to_five_hours():
    result = calculate_salary_hours([{"date": "2026-10-31", "status": "Present"}])

    assert result[0]["regular_hours"] == 5
    assert result[0]["overtime_hours"] == 0


def test_chemical_six_day_schedule_counts_saturday_in_the_50_hour_salary():
    monday = date(2026, 10, 26)
    records = [
        {"date": (monday + timedelta(days=day)).isoformat(), "status": "Present"}
        for day in range(6)
    ]

    result = calculate_salary_hours(records, weekly_regular_limit=50)

    assert sum(day["regular_hours"] for day in result) == 50
    assert sum(day["overtime_hours"] for day in result) == 0
