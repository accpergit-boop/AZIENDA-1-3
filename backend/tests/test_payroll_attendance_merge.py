import asyncio
from copy import deepcopy

import server


class FakeCursor:
    def __init__(self, records):
        self.records = records

    async def to_list(self, length):
        return deepcopy(self.records[:length])


class FakeCollection:
    def __init__(self, records):
        self.records = records

    def find(self, query, projection=None):
        return FakeCursor([
            record for record in self.records
            if all(record.get(key) == value for key, value in query.items())
        ])

    async def find_one(self, query, projection=None):
        return deepcopy(next((
            record for record in self.records
            if all(record.get(key) == value for key, value in query.items())
        ), None))

    async def update_one(self, query, update):
        record = next((
            item for item in self.records
            if all(item.get(key) == value for key, value in query.items())
        ), None)
        if record:
            record.update(update["$set"])
        return type("UpdateResult", (), {"matched_count": int(record is not None)})()

    async def delete_one(self, query):
        self.records[:] = [
            record for record in self.records
            if not all(record.get(key) == value for key, value in query.items())
        ]


class FakeDatabase:
    def __init__(self, attendance):
        self.attendance = FakeCollection(attendance)

    def __getitem__(self, collection):
        return getattr(self, collection)


def test_duplicate_attendance_is_migrated_and_conflicts_are_audited(monkeypatch):
    attendance = [
        {"id": "move", "employee_id": "duplicate", "date": "2026-10-26", "status": "Present"},
        {"id": "keep", "employee_id": "retained", "date": "2026-10-27", "status": "Present"},
        {"id": "conflict", "employee_id": "duplicate", "date": "2026-10-27", "status": "Half Day"},
    ]
    database = FakeDatabase(attendance)
    audit_entries = []

    async def fake_log_audit(*args, **kwargs):
        audit_entries.append((args, kwargs))

    monkeypatch.setattr(server, "db", database)
    monkeypatch.setattr(server, "log_audit", fake_log_audit)

    asyncio.run(server.merge_duplicate_attendance(
        {"id": "duplicate"},
        {"id": "retained", "name": "ASIVE TAILOR", "department": "TAILORING (TAPE EDGE)"},
        {"id": "admin"},
    ))

    moved = next(record for record in attendance if record["id"] == "move")
    assert moved["employee_id"] == "retained"
    assert moved["employee_name"] == "ASIVE TAILOR"
    assert moved["department"] == "TAILORING (TAPE EDGE)"
    assert {record["id"] for record in attendance} == {"move", "keep"}
    assert len(audit_entries) == 1
    assert audit_entries[0][0][2] == "duplicate_attendance_conflict_archived"
    assert audit_entries[0][1]["before"]["status"] == "Half Day"


def test_piecework_sunday_exclusion_ignores_name_spacing_and_case():
    assert not server.piecework_includes_sunday("  Asive   Tailor ")
    assert not server.piecework_includes_sunday("ayanda tailor")
    assert server.piecework_includes_sunday("Ayanda Bhai")
