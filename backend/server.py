from dotenv import load_dotenv
from pathlib import Path
import os
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime, timezone, date, timedelta
import uuid, logging, jwt, bcrypt

import seed_data

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"

app = FastAPI()
api = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()

def today_str():
    return date.today().isoformat()

def new_id():
    return str(uuid.uuid4())

def r2(x):
    return round(float(x or 0) + 1e-9, 2)

def clean(doc):
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc

# ---------------- Auth ----------------
def hash_pw(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_pw(p, h):
    try: return bcrypt.checkpw(p.encode(), h.encode())
    except Exception: return False

def make_token(uid, email):
    payload = {"sub": uid, "email": email, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

class LoginIn(BaseModel):
    email: str
    password: str

@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = make_token(user["id"], email)
    return {"token": token, "user": {"id": user["id"], "email": email, "name": user.get("name", "Admin"), "role": user.get("role", "admin")}}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

# ---------------- Generic helpers ----------------
async def insert(coll, data):
    data = dict(data)
    data.setdefault("id", new_id())
    data["created_at"] = now_iso()
    await db[coll].insert_one(data)
    return clean(await db[coll].find_one({"id": data["id"]}, {"_id": 0}))

async def update_doc(coll, _id, data):
    data = {k: v for k, v in data.items() if k not in ("id", "_id", "created_at")}
    data["updated_at"] = now_iso()
    res = await db[coll].update_one({"id": _id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return clean(await db[coll].find_one({"id": _id}, {"_id": 0}))

async def listall(coll, flt=None, sort=None):
    cur = db[coll].find(flt or {}, {"_id": 0})
    if sort:
        cur = cur.sort(sort[0], sort[1])
    return await cur.to_list(5000)

# ---------------- Customers ----------------
class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    default_zone: int = 1
    payment_terms: Optional[str] = "Due on Delivery"
    active: bool = True

@api.get("/customers")
async def get_customers(user=Depends(get_current_user)):
    return await listall("customers", sort=("name", 1))

@api.post("/customers")
async def add_customer(body: CustomerIn, user=Depends(get_current_user)):
    return await insert("customers", body.model_dump())

@api.put("/customers/{cid}")
async def edit_customer(cid: str, body: CustomerIn, user=Depends(get_current_user)):
    return await update_doc("customers", cid, body.model_dump())

@api.get("/customers/{cid}/summary")
async def customer_summary(cid: str, user=Depends(get_current_user)):
    invs = await listall("invoices", {"customer_id": cid}, ("created_at", -1))
    invs = [i for i in invs if i.get("status") != "void"]
    pays = await listall("payments", {"customer_id": cid}, ("created_at", -1))
    outstanding = r2(sum(i.get("outstanding", 0) for i in invs if i.get("status") != "draft"))
    total_inv = r2(sum(i.get("total", 0) for i in invs if i.get("status") != "draft"))
    return {"invoices": invs, "payments": pays, "outstanding": outstanding, "total_invoiced": total_inv}

# ---------------- Prices ----------------
class PriceIn(BaseModel):
    zone: int
    category: str
    size: str
    price: Optional[float] = None
    active: bool = True
    confirmed: bool = True

@api.get("/prices")
async def get_prices(user=Depends(get_current_user)):
    return await listall("prices", sort=("zone", 1))

@api.post("/prices")
async def add_price(body: PriceIn, user=Depends(get_current_user)):
    d = body.model_dump()
    d["confirmed"] = d.get("price") is not None
    return await insert("prices", d)

@api.put("/prices/{pid}")
async def edit_price(pid: str, body: PriceIn, user=Depends(get_current_user)):
    d = body.model_dump()
    d["confirmed"] = d.get("price") is not None
    return await update_doc("prices", pid, d)

@api.get("/prices/lookup")
async def price_lookup(zone: int, category: str, size: str, user=Depends(get_current_user)):
    p = await db.prices.find_one({"zone": zone, "category": category, "size": size, "active": True}, {"_id": 0})
    if not p:
        return {"found": False, "price": None, "reason": "No matching price configured"}
    if p.get("price") is None or not p.get("confirmed"):
        return {"found": True, "price": None, "needs_config": True, "reason": "Price requires administrator confirmation"}
    return {"found": True, "price": p["price"]}

# ---------------- Invoice calc ----------------
def compute_invoice(inv):
    subtotal = r2(sum(r2(it.get("qty", 0) * (it.get("unit_price") or 0)) for it in inv.get("items", [])))
    discount = r2(inv.get("discount", 0))
    extra = r2(inv.get("extra_charges", 0))
    taxed = max(subtotal - discount + extra, 0)
    tax_amount = r2(taxed * inv.get("tax_rate", 0) / 100) if inv.get("tax_enabled") else 0.0
    total = r2(taxed + tax_amount)
    paid = r2(inv.get("amount_paid", 0))
    outstanding = r2(total - paid)
    for it in inv.get("items", []):
        it["line_total"] = r2(it.get("qty", 0) * (it.get("unit_price") or 0))
    inv["subtotal"] = subtotal
    inv["tax_amount"] = tax_amount
    inv["total"] = total
    inv["amount_paid"] = paid
    inv["outstanding"] = outstanding
    return inv

def derive_status(inv):
    if inv.get("status") == "void":
        return "void"
    if inv.get("status") == "draft":
        return "draft"
    total = inv.get("total", 0)
    paid = inv.get("amount_paid", 0)
    if total > 0 and paid >= total:
        return "paid"
    due = inv.get("due_date")
    if inv.get("outstanding", 0) > 0 and due and due < today_str():
        return "overdue"
    if paid > 0:
        return "partially_paid"
    return "issued"

class InvoiceItem(BaseModel):
    qty: float = 1
    category: str = ""
    size: str = ""
    description: str = ""
    unit_price: Optional[float] = 0
    price_override: bool = False
    tax: bool = False

class InvoiceIn(BaseModel):
    customer_id: str
    customer_name: str = ""
    date: str = Field(default_factory=today_str)
    due_date: Optional[str] = None
    zone: int = 1
    payment_terms: str = "Due on Delivery"
    reference: Optional[str] = ""
    notes: Optional[str] = ""
    items: List[InvoiceItem] = []
    discount: float = 0
    extra_charges: float = 0
    tax_enabled: bool = False
    tax_rate: float = 0
    status: str = "draft"

async def next_invoice_number():
    s = await db.settings.find_one({"id": "singleton"}) or {}
    prefix = s.get("invoice_prefix", "IQF")
    year = date.today().year
    counter = await db.counters.find_one_and_update(
        {"id": f"inv-{year}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=True)
    seq = counter["seq"]
    return f"{prefix}-{year}-{seq:04d}"

@api.get("/invoices/next-number")
async def get_next_number(user=Depends(get_current_user)):
    s = await db.settings.find_one({"id": "singleton"}) or {}
    prefix = s.get("invoice_prefix", "IQF")
    year = date.today().year
    c = await db.counters.find_one({"id": f"inv-{year}"})
    seq = (c["seq"] + 1) if c else 1
    return {"number": f"{prefix}-{year}-{seq:04d}"}

@api.get("/invoices")
async def get_invoices(user=Depends(get_current_user)):
    invs = await listall("invoices", sort=("created_at", -1))
    for i in invs:
        i["status"] = derive_status(i)
    return invs

@api.get("/invoices/{iid}")
async def get_invoice(iid: str, user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    inv["status"] = derive_status(inv)
    inv["payment_records"] = await listall("payments", {"invoice_id": iid}, ("created_at", -1))
    return inv

async def _prepare_invoice(body: InvoiceIn):
    cust = await db.customers.find_one({"id": body.customer_id})
    if not cust:
        raise HTTPException(400, "Customer not found")
    inv = body.model_dump()
    inv["customer_name"] = cust["name"]
    if not inv.get("due_date"):
        inv["due_date"] = inv["date"]
    inv["amount_paid"] = 0
    compute_invoice(inv)
    return inv

@api.post("/invoices")
async def create_invoice(body: InvoiceIn, user=Depends(get_current_user)):
    inv = await _prepare_invoice(body)
    if inv["status"] != "draft":
        inv["number"] = await next_invoice_number()
        inv["issued_at"] = now_iso()
        inv["audit"] = [{"action": "issued", "at": now_iso(), "by": user["email"]}]
    else:
        inv["number"] = None
        inv["audit"] = [{"action": "draft_created", "at": now_iso(), "by": user["email"]}]
    return await insert("invoices", inv)

@api.put("/invoices/{iid}")
async def update_invoice(iid: str, body: InvoiceIn, user=Depends(get_current_user)):
    existing = await db.invoices.find_one({"id": iid})
    if not existing:
        raise HTTPException(404, "Invoice not found")
    if existing.get("status") == "void":
        raise HTTPException(400, "Cannot edit a voided invoice")
    inv = await _prepare_invoice(body)
    inv["amount_paid"] = existing.get("amount_paid", 0)
    compute_invoice(inv)
    inv["number"] = existing.get("number")
    inv["audit"] = existing.get("audit", [])
    # If moving from draft to issued, assign number
    if existing.get("status") == "draft" and inv["status"] != "draft" and not inv["number"]:
        inv["number"] = await next_invoice_number()
        inv["issued_at"] = now_iso()
        inv["audit"].append({"action": "issued", "at": now_iso(), "by": user["email"]})
    else:
        inv["audit"].append({"action": "edited", "at": now_iso(), "by": user["email"]})
    return await update_doc("invoices", iid, inv)

@api.post("/invoices/{iid}/issue")
async def issue_invoice(iid: str, user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": iid})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    upd = {}
    if not inv.get("number"):
        upd["number"] = await next_invoice_number()
        upd["issued_at"] = now_iso()
    upd["status"] = "issued"
    audit = inv.get("audit", [])
    audit.append({"action": "issued", "at": now_iso(), "by": user["email"]})
    upd["audit"] = audit
    return await update_doc("invoices", iid, upd)

@api.post("/invoices/{iid}/void")
async def void_invoice(iid: str, user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": iid})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    audit = inv.get("audit", [])
    audit.append({"action": "voided", "at": now_iso(), "by": user["email"]})
    return await update_doc("invoices", iid, {"status": "void", "audit": audit})

# ---------------- Payments ----------------
class PaymentIn(BaseModel):
    amount: float
    method: str = "Cash"
    date: str = Field(default_factory=today_str)
    reference: Optional[str] = ""
    notes: Optional[str] = ""

@api.post("/invoices/{iid}/payments")
async def record_payment(iid: str, body: PaymentIn, user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": iid})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("status") == "void":
        raise HTTPException(400, "Cannot pay a voided invoice")
    amt = r2(body.amount)
    if amt <= 0:
        raise HTTPException(400, "Amount must be positive")
    outstanding = r2(inv.get("outstanding", 0))
    if amt > outstanding + 0.001:
        raise HTTPException(400, f"Amount exceeds outstanding balance of R {outstanding:.2f}")
    pay = body.model_dump()
    pay["invoice_id"] = iid
    pay["invoice_number"] = inv.get("number")
    pay["customer_id"] = inv.get("customer_id")
    pay["customer_name"] = inv.get("customer_name")
    pay_rec = await insert("payments", pay)
    new_paid = r2(inv.get("amount_paid", 0) + amt)
    inv["amount_paid"] = new_paid
    compute_invoice(inv)
    status = inv.get("status")
    if status == "draft":
        status = "issued"
        if not inv.get("number"):
            inv["number"] = await next_invoice_number()
    audit = inv.get("audit", [])
    audit.append({"action": "payment", "amount": amt, "at": now_iso(), "by": user["email"]})
    await update_doc("invoices", iid, {
        "amount_paid": new_paid, "outstanding": inv["outstanding"],
        "status": status, "number": inv.get("number"), "audit": audit})
    return pay_rec

@api.get("/payments")
async def get_payments(user=Depends(get_current_user)):
    return await listall("payments", sort=("created_at", -1))

# ---------------- Stock ----------------
class StockIn(BaseModel):
    product: str
    size: str
    opening: float = 0
    threshold: float = 5

async def stock_current(s):
    movs = await listall("stock_movements", {"stock_id": s["id"]})
    delta = 0
    for m in movs:
        delta += m["quantity"] if m["type"] in ("production", "adjustment_in", "return") else -m["quantity"]
    s["current"] = r2(s.get("opening", 0) + delta)
    s["production_received"] = r2(sum(m["quantity"] for m in movs if m["type"] == "production"))
    s["dispatched"] = r2(sum(m["quantity"] for m in movs if m["type"] == "dispatch"))
    s["adjustments"] = r2(sum((m["quantity"] if m["type"] in ("adjustment_in", "return") else -m["quantity"]) for m in movs if m["type"] in ("adjustment_in", "adjustment_out", "return")))
    s["last_movement"] = max([m["created_at"] for m in movs], default=None)
    return s

@api.get("/stock")
async def get_stock(user=Depends(get_current_user)):
    items = await listall("stock", sort=("product", 1))
    for s in items:
        await stock_current(s)
    return items

@api.post("/stock")
async def add_stock(body: StockIn, user=Depends(get_current_user)):
    return await insert("stock", body.model_dump())

@api.put("/stock/{sid}")
async def edit_stock(sid: str, body: StockIn, user=Depends(get_current_user)):
    return await update_doc("stock", sid, body.model_dump())

class MovementIn(BaseModel):
    type: str  # production, dispatch, adjustment_in, adjustment_out, return
    quantity: float
    reason: Optional[str] = ""
    reference: Optional[str] = ""

@api.post("/stock/{sid}/movements")
async def add_movement(sid: str, body: MovementIn, user=Depends(get_current_user)):
    s = await db.stock.find_one({"id": sid})
    if not s:
        raise HTTPException(404, "Stock item not found")
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    m = body.model_dump()
    m["stock_id"] = sid
    m["product"] = s["product"]
    m["size"] = s["size"]
    m["user"] = user["email"]
    return await insert("stock_movements", m)

@api.get("/stock/movements")
async def get_movements(user=Depends(get_current_user)):
    return await listall("stock_movements", sort=("created_at", -1))

# ---------------- Production ----------------
class ProductionIn(BaseModel):
    block_ref: str
    production_date: str = Field(default_factory=today_str)
    status: str = "Planned"
    resting_start: Optional[str] = None
    resting_end: Optional[str] = None
    planned_cutting: Optional[str] = None
    confirmed_qty: float = 0
    stock_id: Optional[str] = None
    notes: Optional[str] = ""

@api.get("/production")
async def get_production(user=Depends(get_current_user)):
    return await listall("production", sort=("created_at", -1))

@api.post("/production")
async def add_production(body: ProductionIn, user=Depends(get_current_user)):
    return await insert("production", body.model_dump())

@api.put("/production/{pid}")
async def edit_production(pid: str, body: ProductionIn, user=Depends(get_current_user)):
    existing = await db.production.find_one({"id": pid})
    if not existing:
        raise HTTPException(404, "Not found")
    d = body.model_dump()
    # When confirmed as Consumed with qty and stock link, add production stock movement once
    if d.get("status") == "Consumed" and d.get("confirmed_qty", 0) > 0 and d.get("stock_id") and not existing.get("stock_added"):
        await insert("stock_movements", {
            "stock_id": d["stock_id"], "type": "production", "quantity": d["confirmed_qty"],
            "reason": f"Production block {d['block_ref']}", "reference": d["block_ref"], "user": user["email"],
            "product": "", "size": ""})
        d["stock_added"] = True
    else:
        d["stock_added"] = existing.get("stock_added", False)
    return await update_doc("production", pid, d)

# ---------------- Employees & Attendance ----------------
class EmployeeIn(BaseModel):
    name: str
    department: str = "Production"
    active: bool = True

@api.get("/employees")
async def get_employees(user=Depends(get_current_user)):
    return await listall("employees", sort=("name", 1))

@api.post("/employees")
async def add_employee(body: EmployeeIn, user=Depends(get_current_user)):
    return await insert("employees", body.model_dump())

@api.put("/employees/{eid}")
async def edit_employee(eid: str, body: EmployeeIn, user=Depends(get_current_user)):
    return await update_doc("employees", eid, body.model_dump())

class AttendanceIn(BaseModel):
    employee_id: str
    date: str
    status: str = "Present"
    notes: Optional[str] = ""

@api.get("/attendance")
async def get_attendance(user=Depends(get_current_user)):
    return await listall("attendance", sort=("date", -1))

@api.post("/attendance")
async def add_attendance(body: AttendanceIn, user=Depends(get_current_user)):
    emp = await db.employees.find_one({"id": body.employee_id})
    if not emp:
        raise HTTPException(400, "Employee not found")
    existing = await db.attendance.find_one({"employee_id": body.employee_id, "date": body.date})
    data = body.model_dump()
    data["employee_name"] = emp["name"]
    data["department"] = emp.get("department", "")
    if existing:
        return await update_doc("attendance", existing["id"], data)
    return await insert("attendance", data)

# ---------------- Drivers & Vehicles ----------------
class DriverIn(BaseModel):
    name: str
    preferences: Optional[str] = ""
    size_pref: str = "small"
    active: bool = True

@api.get("/drivers")
async def get_drivers(user=Depends(get_current_user)):
    return await listall("drivers", sort=("name", 1))

@api.post("/drivers")
async def add_driver(body: DriverIn, user=Depends(get_current_user)):
    return await insert("drivers", body.model_dump())

@api.put("/drivers/{did}")
async def edit_driver(did: str, body: DriverIn, user=Depends(get_current_user)):
    return await update_doc("drivers", did, body.model_dump())

class VehicleIn(BaseModel):
    name: str
    registration: Optional[str] = ""
    vtype: Optional[str] = ""
    capacity: Optional[str] = ""
    length: Optional[str] = ""
    available: bool = True
    notes: Optional[str] = ""

@api.get("/vehicles")
async def get_vehicles(user=Depends(get_current_user)):
    return await listall("vehicles", sort=("name", 1))

@api.post("/vehicles")
async def add_vehicle(body: VehicleIn, user=Depends(get_current_user)):
    return await insert("vehicles", body.model_dump())

@api.put("/vehicles/{vid}")
async def edit_vehicle(vid: str, body: VehicleIn, user=Depends(get_current_user)):
    return await update_doc("vehicles", vid, body.model_dump())

# ---------------- Deliveries ----------------
class DeliveryIn(BaseModel):
    reference: Optional[str] = ""
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    destination: str = ""
    size: str = "small"
    products: Optional[str] = ""
    driver_id: Optional[str] = ""
    vehicle_id: Optional[str] = ""
    planned_departure: Optional[str] = None
    actual_departure: Optional[str] = None
    estimated_arrival: Optional[str] = None
    actual_arrival: Optional[str] = None
    status: str = "Planned"
    notes: Optional[str] = ""
    cash_collected: float = 0
    items: List[dict] = []  # [{stock_id, product, size, qty}]

@api.get("/deliveries")
async def get_deliveries(user=Depends(get_current_user)):
    return await listall("deliveries", sort=("created_at", -1))

@api.post("/deliveries")
async def add_delivery(body: DeliveryIn, user=Depends(get_current_user)):
    d = body.model_dump()
    if not d.get("reference"):
        cnt = await db.deliveries.count_documents({})
        d["reference"] = f"DEL-{date.today().year}-{cnt+1:04d}"
    if d.get("customer_id"):
        cust = await db.customers.find_one({"id": d["customer_id"]})
        if cust:
            d["customer_name"] = cust["name"]
    d["dispatched"] = False
    return await insert("deliveries", d)

@api.put("/deliveries/{did}")
async def edit_delivery(did: str, body: DeliveryIn, user=Depends(get_current_user)):
    existing = await db.deliveries.find_one({"id": did})
    if not existing:
        raise HTTPException(404, "Not found")
    d = body.model_dump()
    d["reference"] = existing.get("reference")
    d["dispatched"] = existing.get("dispatched", False)
    if d.get("customer_id"):
        cust = await db.customers.find_one({"id": d["customer_id"]})
        if cust:
            d["customer_name"] = cust["name"]
    return await update_doc("deliveries", did, d)

@api.post("/deliveries/{did}/dispatch")
async def dispatch_delivery(did: str, user=Depends(get_current_user)):
    d = await db.deliveries.find_one({"id": did})
    if not d:
        raise HTTPException(404, "Not found")
    if d.get("dispatched"):
        raise HTTPException(400, "This delivery has already deducted stock")
    for it in d.get("items", []):
        if it.get("stock_id") and it.get("qty", 0) > 0:
            s = await db.stock.find_one({"id": it["stock_id"]})
            if s:
                await insert("stock_movements", {
                    "stock_id": it["stock_id"], "type": "dispatch", "quantity": it["qty"],
                    "reason": f"Dispatch {d['reference']}", "reference": d["reference"],
                    "user": user["email"], "product": s["product"], "size": s["size"]})
    audit = {"status": "Dispatched", "dispatched": True, "actual_departure": d.get("actual_departure") or now_iso()}
    return await update_doc("deliveries", did, audit)

@api.get("/deliveries/recommend")
async def recommend_driver(size: str = "small", user=Depends(get_current_user)):
    drivers = await listall("drivers", {"active": True})
    recs = []
    for dr in drivers:
        reason = []
        score = 0
        if size == "large" and dr.get("size_pref") == "large":
            score += 3; reason.append("Prefers larger / long-distance deliveries")
        elif size in ("small", "medium") and dr.get("size_pref") == "small":
            score += 3; reason.append("Prefers small & medium deliveries")
        else:
            score += 1; reason.append("Can handle this delivery when needed")
        recs.append({"driver_id": dr["id"], "name": dr["name"], "score": score, "reason": "; ".join(reason)})
    recs.sort(key=lambda x: -x["score"])
    return recs

# ---------------- Settings ----------------
@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"id": "singleton"}, {"_id": 0})
    return s or seed_data.DEFAULT_SETTINGS

@api.put("/settings")
async def update_settings(body: dict, user=Depends(get_current_user)):
    body.pop("_id", None)
    body["id"] = "singleton"
    await db.settings.update_one({"id": "singleton"}, {"$set": body}, upsert=True)
    return clean(await db.settings.find_one({"id": "singleton"}, {"_id": 0}))

# ---------------- Dashboard ----------------
@api.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    invs = await listall("invoices")
    for i in invs:
        i["status"] = derive_status(i)
    valid = [i for i in invs if i["status"] not in ("void", "draft")]
    total_invoiced = r2(sum(i.get("total", 0) for i in valid))
    pays = await listall("payments")
    payments_received = r2(sum(p.get("amount", 0) for p in pays))
    outstanding = r2(sum(i.get("outstanding", 0) for i in valid))

    stock = await listall("stock")
    for s in stock:
        await stock_current(s)
    finished_stock = r2(sum(s.get("current", 0) for s in stock))
    low_stock = [s for s in stock if s.get("current", 0) <= s.get("threshold", 0)]

    prod = await listall("production")
    ready_cutting = [p for p in prod if p.get("status") == "Ready for Cutting"]
    resting = [p for p in prod if p.get("status") == "Resting"]

    att_today = await listall("attendance", {"date": today_str()})
    deliveries = await listall("deliveries")
    upcoming = [d for d in deliveries if d.get("status") in ("Planned", "Assigned", "Ready", "Dispatched")][:8]

    recent_invoices = sorted(invs, key=lambda x: x.get("created_at", ""), reverse=True)[:8]

    orders = await listall("orders", sort=("created_at", -1))
    orders_to_send = [o for o in orders if o.get("status") in ("To Send", "Preparing", "Assigned")][:8]
    week, _ = period_starts()
    week_profit = await profit_for(week)
    parts_to_buy = await listall("spareparts", {"status": "to_buy"})

    # production recommendations: finished stock below safety stock
    settings = await db.settings.find_one({"id": "singleton"}) or {}
    safety = settings.get("safety_stock", 10)
    recommendations = []
    for s in stock:
        if s.get("current", 0) < s.get("threshold", 0):
            need = max(s.get("threshold", 0) * 2 - s.get("current", 0), 0)
            recommendations.append({"product": s["product"], "size": s["size"],
                                    "recommend_qty": need,
                                    "reason": f"Current {s['current']} is below low-stock threshold {s['threshold']}"})

    return {
        "total_invoiced": total_invoiced,
        "payments_received": payments_received,
        "outstanding": outstanding,
        "finished_stock": finished_stock,
        "low_stock": low_stock,
        "recommendations": recommendations,
        "ready_cutting": ready_cutting,
        "resting": resting,
        "attendance_today": att_today,
        "upcoming_deliveries": upcoming,
        "recent_invoices": recent_invoices,
        "current_stock": stock,
        "invoice_count": len(valid),
        "orders_to_send": orders_to_send,
        "week_profit": week_profit,
        "parts_to_buy_count": len(parts_to_buy),
    }

# ---------------- Expenses ----------------
class ExpenseIn(BaseModel):
    description: str
    amount: float
    date: str = Field(default_factory=today_str)
    category: str = "General"

@api.get("/expenses")
async def get_expenses(user=Depends(get_current_user)):
    return await listall("expenses", sort=("date", -1))

@api.post("/expenses")
async def add_expense(body: ExpenseIn, user=Depends(get_current_user)):
    return await insert("expenses", body.model_dump())

@api.put("/expenses/{eid}")
async def edit_expense(eid: str, body: ExpenseIn, user=Depends(get_current_user)):
    return await update_doc("expenses", eid, body.model_dump())

@api.delete("/expenses/{eid}")
async def del_expense(eid: str, user=Depends(get_current_user)):
    await db.expenses.delete_one({"id": eid})
    return {"ok": True}

def period_starts():
    t = date.today()
    week = (t - timedelta(days=t.weekday())).isoformat()
    month = t.replace(day=1).isoformat()
    return week, month

async def profit_for(since):
    pays = await listall("payments")
    exps = await listall("expenses")
    vrecs = await listall("vehicle_records")
    revenue = r2(sum(p.get("amount", 0) for p in pays if (p.get("date") or "") >= since))
    expense = r2(sum(x.get("amount", 0) for x in exps if (x.get("date") or "") >= since)
                 + sum(x.get("amount", 0) or 0 for x in vrecs if (x.get("date") or "") >= since))
    return {"revenue": revenue, "expenses": expense, "profit": r2(revenue - expense)}

@api.get("/reports/profit")
async def profit_report(user=Depends(get_current_user)):
    week, month = period_starts()
    all_exp = await listall("expenses")
    vrecs = await listall("vehicle_records")
    return {
        "week": await profit_for(week),
        "month": await profit_for(month),
        "total_expenses": r2(sum(x.get("amount", 0) for x in all_exp)
                             + sum(x.get("amount", 0) or 0 for x in vrecs)),
        "week_start": week, "month_start": month,
    }

# ---------------- Vehicle records (expenses/repairs/maintenance) ----------------
class VehicleRecordIn(BaseModel):
    type: str = "expense"  # expense, repair, maintenance
    description: str = ""
    amount: float = 0
    date: str = Field(default_factory=today_str)
    status: str = "done"  # needed, done

@api.get("/vehicles/records/all")
async def all_vehicle_records(user=Depends(get_current_user)):
    return await listall("vehicle_records", sort=("date", -1))

@api.get("/vehicles/{vid}/records")
async def get_vehicle_records(vid: str, user=Depends(get_current_user)):
    return await listall("vehicle_records", {"vehicle_id": vid}, ("date", -1))

@api.post("/vehicles/{vid}/records")
async def add_vehicle_record(vid: str, body: VehicleRecordIn, user=Depends(get_current_user)):
    v = await db.vehicles.find_one({"id": vid})
    d = body.model_dump()
    d["vehicle_id"] = vid
    d["vehicle_name"] = v["name"] if v else ""
    return await insert("vehicle_records", d)

@api.delete("/vehicles/records/{rid}")
async def del_vehicle_record(rid: str, user=Depends(get_current_user)):
    await db.vehicle_records.delete_one({"id": rid})
    return {"ok": True}

# ---------------- Spare parts ----------------
class SparePartIn(BaseModel):
    name: str
    quantity: float = 1
    expected_price: float = 0
    vehicle_id: Optional[str] = ""
    status: str = "to_buy"  # to_buy, bought, installed
    notes: Optional[str] = ""

@api.get("/spareparts")
async def get_spareparts(user=Depends(get_current_user)):
    parts = await listall("spareparts", sort=("created_at", -1))
    vehicles = {v["id"]: v["name"] for v in await listall("vehicles")}
    for p in parts:
        p["vehicle_name"] = vehicles.get(p.get("vehicle_id"), "")
    return parts

@api.post("/spareparts")
async def add_sparepart(body: SparePartIn, user=Depends(get_current_user)):
    return await insert("spareparts", body.model_dump())

@api.put("/spareparts/{pid}")
async def edit_sparepart(pid: str, body: SparePartIn, user=Depends(get_current_user)):
    return await update_doc("spareparts", pid, body.model_dump())

@api.delete("/spareparts/{pid}")
async def del_sparepart(pid: str, user=Depends(get_current_user)):
    await db.spareparts.delete_one({"id": pid})
    return {"ok": True}

# ---------------- Orders to send ----------------
class OrderIn(BaseModel):
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    destination: str = ""
    products: str = ""
    priority: str = "Normal"  # Low, Normal, High, Urgent
    status: str = "To Send"  # To Send, Preparing, Assigned, Dispatched, Delivered, Cancelled
    expected_ship_date: Optional[str] = None
    vehicle_id: Optional[str] = ""
    notes: Optional[str] = ""

@api.get("/orders")
async def get_orders(user=Depends(get_current_user)):
    return await listall("orders", sort=("created_at", -1))

@api.post("/orders")
async def add_order(body: OrderIn, user=Depends(get_current_user)):
    d = body.model_dump()
    cnt = await db.orders.count_documents({})
    d["reference"] = f"ORD-{date.today().year}-{cnt+1:04d}"
    if d.get("customer_id"):
        c = await db.customers.find_one({"id": d["customer_id"]})
        if c:
            d["customer_name"] = c["name"]
    return await insert("orders", d)

@api.put("/orders/{oid}")
async def edit_order(oid: str, body: OrderIn, user=Depends(get_current_user)):
    existing = await db.orders.find_one({"id": oid})
    if not existing:
        raise HTTPException(404, "Order not found")
    d = body.model_dump()
    d["reference"] = existing.get("reference")
    if d.get("customer_id"):
        c = await db.customers.find_one({"id": d["customer_id"]})
        if c:
            d["customer_name"] = c["name"]
    return await update_doc("orders", oid, d)

@api.delete("/orders/{oid}")
async def del_order(oid: str, user=Depends(get_current_user)):
    await db.orders.delete_one({"id": oid})
    return {"ok": True}

# ---------------- Attendance summary ----------------
@api.get("/attendance/summary")
async def attendance_summary(user=Depends(get_current_user)):
    week, month = period_starts()
    recs = await listall("attendance")
    emps = await listall("employees", {"active": True}, ("name", 1))
    t = today_str()
    daily = {}
    for r in recs:
        if r.get("date") == t:
            daily[r["status"]] = daily.get(r["status"], 0) + 1
    present = ("Present", "Half Day")

    def count(eid, since):
        return sum(1 for r in recs if r.get("employee_id") == eid and (r.get("date") or "") >= since and r.get("status") in present)

    per_emp = [{"employee_id": e["id"], "name": e["name"], "department": e.get("department", ""),
                "week": count(e["id"], week), "month": count(e["id"], month)} for e in emps]
    return {"daily": daily, "daily_total": sum(daily.values()),
            "week_total": sum(e["week"] for e in per_emp),
            "month_total": sum(e["month"] for e in per_emp),
            "per_employee": per_emp, "week_start": week, "month_start": month}

# ---------------- Seeding ----------------
async def seed():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"id": new_id(), "email": admin_email,
                                   "password_hash": hash_pw(admin_pw), "name": "Admin",
                                   "role": "admin", "created_at": now_iso()})
    elif not verify_pw(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_pw(admin_pw)}})

    if await db.customers.count_documents({}) == 0:
        for n in seed_data.CUSTOMERS:
            await db.customers.insert_one({"id": new_id(), "name": n, "phone": "", "email": "",
                                           "address": "", "default_zone": 1,
                                           "payment_terms": "Due on Delivery", "active": True,
                                           "created_at": now_iso()})
    if await db.prices.count_documents({}) == 0:
        for p in seed_data.PRICES:
            await db.prices.insert_one({"id": new_id(), **p, "created_at": now_iso()})
    if await db.stock.count_documents({}) == 0:
        for s in seed_data.STOCK:
            await db.stock.insert_one({"id": new_id(), **s, "created_at": now_iso()})
    if await db.drivers.count_documents({}) == 0:
        for d in seed_data.DRIVERS:
            await db.drivers.insert_one({"id": new_id(), **d, "created_at": now_iso()})
    for v in seed_data.TRAILERS + seed_data.FLEET:
        if not await db.vehicles.find_one({"name": v["name"]}):
            await db.vehicles.insert_one({"id": new_id(), **v, "created_at": now_iso()})
    if await db.settings.count_documents({}) == 0:
        await db.settings.insert_one({**seed_data.DEFAULT_SETTINGS, "created_at": now_iso()})

@app.on_event("startup")
async def on_startup():
    await seed()

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
