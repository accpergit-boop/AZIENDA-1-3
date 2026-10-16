import os, re, asyncio, uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient

DATA = """Simple:760x50=265,760x75=100,760x100=170,760x120=290,760x150=60,910x50=365,910x75=490,910x100=660,910x120=365,910x150=147,1070x50=140,1070x75=280,1070x100=290,1070x120=335,1070x150=45,1370x50=115,1370x75=70,1370x100=150,1370x120=90,1370x150=40
Ribbon:760x100=5,760x120=0,760x150=0,910x100=53,910x120=25,910x150=0,1070x100=45,1070x120=105,1070x150=0,1370x100=0,1370x120=0,1370x150=0
Strong Boy:760x125=0,910x125=0,1070x125=10,1370x125=0
Uncovered:910x100=30,1070x100=10,1370x100=0
Candy:760x100=10,910x100=10,910x120=0,910x125=0,1070x100=0,1070x120=0,1370x100=0,1370x120=0
Black:760x100=30,760x120=5,760x150=0,910x100=35,910x120=5,910x150=45,1070x100=135,1070x120=130,1070x150=0"""
MINIMUMS = {("Black", "910x100"): 5, ("Simple", "1070x100"): 10, ("Ribbon", "910x100"): 5, ("Candy", "760x100"): 8}

STOCK = []
for line in DATA.splitlines():
    prod, rest = line.split(":")
    for kv in rest.split(","):
        size, q = kv.split("=")
        STOCK.append({"product": prod, "size": size, "opening": int(q), "threshold": MINIMUMS.get((prod, size), 0)})

async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    keep = {(s["product"], s["size"]) for s in STOCK}
    old = [s for s in await db.stock.find({}, {"_id": 0}).to_list(1000) if (s["product"], s["size"]) not in keep]
    ids = [s["id"] for s in old]
    m = await db.stock_movements.delete_many({"stock_id": {"$in": ids}})
    d = await db.stock.delete_many({"id": {"$in": ids}})
    added = 0
    for s in STOCK:
        if not await db.stock.find_one({"product": s["product"], "size": s["size"]}):
            await db.stock.insert_one({"id": str(uuid.uuid4()), **s, "created_at": datetime.now(timezone.utc).isoformat()})
            added += 1
    await db.audit_log.insert_one({"id": str(uuid.uuid4()), "entity": "stock", "entity_id": "all", "action": "stock_reset_to_real_count",
                                   "before": {"removed": [f"{s['product']} {s['size']}" for s in old]}, "after": {"added": added},
                                   "reason": "Owner provided real stock count; test/placeholder stock removed", "user": "system",
                                   "at": datetime.now(timezone.utc).isoformat()})
    print("removed items", d.deleted_count, "movements", m.deleted_count, "added", added, "total", await db.stock.count_documents({}))

if __name__ == "__main__":
    asyncio.run(main())
