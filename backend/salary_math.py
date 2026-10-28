from datetime import date, datetime


def calculate_salary_hours(records, weekly_regular_limit=45):
    weekly_regular_hours = {}
    days = []

    for record in sorted(records, key=lambda item: item.get("date", "")):
        status = record.get("status")
        start_time = record.get("start_time")
        end_time = record.get("end_time")

        if status not in ("Present", "Half Day"):
            worked_hours = 0.0
            manual_overtime = 0.0
        elif start_time and end_time:
            start = datetime.strptime(start_time, "%H:%M")
            end = datetime.strptime(end_time, "%H:%M")
            worked_hours = ((end - start).total_seconds() / 3600) % 24
            manual_overtime = 0.0
        else:
            weekday = date.fromisoformat(record["date"]).weekday()
            default_full_day = 5 if weekday == 5 else 9 if weekday < 5 else 0
            worked_hours = default_full_day if status == "Present" else default_full_day / 2
            manual_overtime = float(record.get("overtime_hours", 0) or 0)

        week = date.fromisoformat(record["date"]).isocalendar()[:2]
        regular_remaining = max(0, weekly_regular_limit - weekly_regular_hours.get(week, 0))
        regular = min(worked_hours, regular_remaining)
        overtime = worked_hours - regular + manual_overtime
        weekly_regular_hours[week] = weekly_regular_hours.get(week, 0) + regular
        days.append({
            "date": record.get("date"),
            "status": status,
            "regular_hours": regular,
            "overtime_hours": overtime,
        })

    return days
