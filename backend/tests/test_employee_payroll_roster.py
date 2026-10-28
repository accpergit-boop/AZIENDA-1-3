import seed_data


def test_payroll_roster_matches_the_31_employees_in_the_supplied_image():
    roster = seed_data.EMPLOYEE_PAYROLL_ROSTER

    assert len(roster) == 31
    assert len({employee["name"].casefold() for employee in roster}) == 31
    assert all(employee["pay_type"] == "hourly" for employee in roster)
    assert {employee["department"] for employee in roster} == {
        "CHEMICAL",
        "COVER STITCHING",
        "FABRIC CUTTING",
        "TAILORING (TAPE EDGE)",
        "MATTRESS PACKING (PLASTING)",
        "MATTRESS COVERING AND LOADING",
        "DRIVING",
        "SECURITY",
    }
    assert sum(employee["weekly_salary"] for employee in roster) == 30800
    assert sum(6 if employee["hours_per_week"] == 50 else 5 for employee in roster) == 166
    assert not {employee["name"] for employee in roster} & {"AMEENA", "MR. YASEEN"}


def test_non_chemical_employees_not_scheduled_saturdays_have_45_hour_weeks():
    non_chemical = [
        employee for employee in seed_data.EMPLOYEE_PAYROLL_ROSTER
        if employee["department"] != "CHEMICAL"
        and employee["name"] not in ("SHERIF", "ABDUL DRIVER", "BILAL", "SECURITY GUARD")
    ]

    assert all(employee["hours_per_week"] == 45 for employee in non_chemical)
    expected_salaries = {
        "CASSIM": 900,
        "NONTEMBISO": 900,
        "NTOSH": 1000,
        "ANELE FABRIC": 1000,
        "ANELE PLASTIC": 1000,
        "MNEH": 1000,
        "TMABANE": 800,
    }
    roster = {employee["name"]: employee for employee in seed_data.EMPLOYEE_PAYROLL_ROSTER}
    assert {name: roster[name]["weekly_salary"] for name in expected_salaries} == expected_salaries
    assert roster["MNEH"]["department"] == "MATTRESS PACKING (PLASTING)"
    assert roster["TMABANE"]["department"] == "CHEMICAL"
    assert roster["LUNGHISANI"]["department"] == "CHEMICAL"
    assert seed_data.EMPLOYEE_PAYROLL_NAME_ALIASES == {
        "MINEH": "MNEH",
        "TMBANE": "TMABANE",
    }


def test_chemical_and_selected_employees_have_50_hour_salary_weeks():
    fifty_hour_employees = [
        employee for employee in seed_data.EMPLOYEE_PAYROLL_ROSTER
        if employee["hours_per_week"] == 50
    ]

    assert [employee["name"] for employee in fifty_hour_employees] == [
        "YUSUF", "SEAN", "MANDLENKOSI", "MSIZI", "MTLENI",
        "LUNGHISANI", "TMABANE", "SHERIF", "ABDUL DRIVER", "BILAL", "SECURITY GUARD",
    ]


def test_chemical_rates_use_six_day_50_hour_schedule():
    chemical = [
        employee for employee in seed_data.EMPLOYEE_PAYROLL_ROSTER
        if employee["department"] == "CHEMICAL"
    ]

    assert all(employee["hours_per_week"] == 50 for employee in chemical)
    assert [employee["weekly_salary"] / employee["hours_per_week"] for employee in chemical] == [
        23, 20, 20, 20, 20, 18, 16,
    ]


def test_security_guard_has_fixed_1000_weekly_salary_for_50_hours():
    security = next(
        employee for employee in seed_data.EMPLOYEE_PAYROLL_ROSTER
        if employee["name"] == "SECURITY GUARD"
    )

    assert security["department"] == "SECURITY"
    assert security["hours_per_week"] == 50
    assert security["weekly_salary"] == 1000
