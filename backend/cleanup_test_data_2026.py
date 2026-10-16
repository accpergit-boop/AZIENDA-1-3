"""One-off clean start: remove all automated-test data, keep real customers/opening balances/stock/fleet. Usage: python cleanup_test_data_2026.py [--dry]"""
import asyncio, os, sys, uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient

WIPE_ALL = ["orders", "deliveries", "expenses", "production", "vehicle_records", "spareparts", "attendance",
            "stock_movements", "assistant_sessions", "assistant_messages"]
TEST = {"$regex": "^TEST_", "$options": "i"}

async def main(dry):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    report = {}
    ob = await db.invoices.find({"opening_balance": True}, {"_id": 0}).to_list(1000)
    ob_ids = [i["id"] for i in ob]
    plan = {
        "invoices": {"opening_balance": {"$ne": True}},
        "payments": {"invoice_id": {"$nin": ob_ids}},
        "customers": {"name": TEST},
        "vehicles": {"name": TEST},
        "employees": {"name": TEST},
        "drivers": {"name": TEST},
        "stock": {"product": TEST},
        "prices": {"category": TEST},
        "users": {"email": {"$regex": "test", "$options": "i"}, "role": {"$ne": "owner"}, "email_ne": None},
        **{c: {} for c in WIPE_ALL},
    }
    plan["users"] = {"email": {"$regex": "^test", "$options": "i"}}
    for coll, flt in plan.items():
        report[coll] = await db[coll].count_documents(flt)
        if not dry:
            await db[coll].delete_many(flt)
    if not dry:
        await db.user_sessions.delete_many({"user_id": {"$nin": [u["id"] for u in await db.users.find({}, {"id": 1}).to_list(100)]}})
        await db.stock.update_many({}, {"$unset": {"lock": ""}})
        await db.invoices.update_many({}, {"$unset": {"payment_lock": ""}})
        s = await db.settings.find_one({"id": "singleton"}) or {}
        prefix, year = s.get("invoice_prefix", "IQF"), datetime.now(timezone.utc).year
        ob.sort(key=lambda i: (i.get("customer_name", "").upper(), i.get("customer_id", "")))
        for n, inv in enumerate(ob, 1):
            await db.invoices.update_one({"id": inv["id"]}, {"$set": {"number": f"{prefix}-{year}-{n:04d}"}})
        await db.counters.update_one({"id": f"inv-{year}"}, {"$set": {"seq": len(ob)}}, upsert=True)
        for k in ("del", "ord"):
            await db.counters.update_one({"id": f"{k}-{year}"}, {"$set": {"seq": 0}}, upsert=True)
        await db.audit_log.delete_many({})
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "entity": "system", "entity_id": "cleanup", "action": "test_data_removed",
                                       "before": report, "after": {"opening_balance_invoices_renumbered": len(ob)},
                                       "reason": "Clean start: owner confirmed all non opening-balance records were test data",
                                       "user": "system", "at": datetime.now(timezone.utc).isoformat()})
    print("DRY RUN" if dry else "DONE", report, "opening balances kept:", len(ob))

if __name__ == "__main__":
    asyncio.run(main("--dry" in sys.argv))
