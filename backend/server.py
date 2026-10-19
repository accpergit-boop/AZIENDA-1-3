from dotenv import load_dotenv
from pathlib import Path
import os
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
load_dotenv(ROOT_DIR / '.env.multicompany')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import StreamingResponse
import json, re
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo
import uuid, logging, jwt, bcrypt
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

import seed_data
from tenancy import DEFAULT_COMPANY_ID, GLOBAL_COLLECTIONS, ScopedDatabase, active_company_id, tenant_database, uses_unified_price_list

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
base_db = client[os.environ['DB_NAME']]
db = ScopedDatabase(client, base_db)

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"

app = FastAPI()
api = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()

TZ = ZoneInfo("Africa/Johannesburg")

def local_now():
    return datetime.now(TZ)

def local_today():
    return local_now().date()

def today_str():
    return local_today().isoformat()

COMPANY_PROFILES = [
    {"id": "superiqfoam", "name": "SUPERIQFOAM", "username": "SUPERIQFOAM"},
    {"id": "iqfoam-manufactoring", "name": "IQFOAM MANUFACTORING", "username": "IQFOAM MANUFACTORING"},
    {"id": "iqfoam-whole-sallers", "name": "IQFOAM WHOLE SALLERS", "username": "IQFOAM WHOLE SALLERS"},
]

COMPANY_INVOICE_DETAILS = {
    "iqfoam-manufactoring": {
        "company_name": "iQ Foam Manufacturer",
        "address": "14 Pentrich Rd, Camps Drift, Pietermaritzburg, 3201",
        "telephone": "+27 78 673 2087",
    },
    "iqfoam-whole-sallers": {
        "company_name": "iQ Foam Wholesale",
        "address": "13 Manchester Rd, Northdale, Pietermaritzburg, 3201",
        "telephone": "+27 60 400 8600",
    },
}

def company_role(user, company_id):
    if user.get("role") == "owner":
        return "owner"
    return (user.get("company_roles") or {}).get(company_id)

def allowed_company_ids(user):
    if user.get("role") == "owner":
        return [profile["id"] for profile in COMPANY_PROFILES]
    return [company_id for company_id, role in (user.get("company_roles") or {}).items()
            if role in ("user", "admin")]

def diesel_price_is_current(effective_date):
    try:
        age_days = (local_today() - date.fromisoformat(str(effective_date))).days
        return 0 <= age_days <= 45
    except (TypeError, ValueError):
        return False

def new_id():
    return str(uuid.uuid4())

def D(x):
    return Decimal(str(x or 0))

def r2(x):
    return float(D(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def dsum(vals):
    return r2(sum((D(v) for v in vals), Decimal("0")))

def clean(doc):
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc

def parse_dt(s):
    if not s:
        return None
    dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    return dt.replace(tzinfo=TZ) if dt.tzinfo is None else dt

def fmt_local(s):
    return parse_dt(s).astimezone(TZ).strftime("%d %b %Y, %H:%M")

class StockLock:
    def __init__(self, ids):
        self.ids = sorted(set(ids))
        self.held = []

    async def __aenter__(self):
        import asyncio
        for sid in self.ids:
            for _ in range(50):
                if await db.stock.find_one_and_update({"id": sid, "lock": {"$ne": True}}, {"$set": {"lock": True}}):
                    self.held.append(sid)
                    break
                await asyncio.sleep(0.1)
            else:
                await self.__aexit__()
                raise HTTPException(409, "Stock is being updated by another operation. Please retry")
        return self

    async def __aexit__(self, *a):
        if self.held:
            await db.stock.update_many({"id": {"$in": self.held}}, {"$unset": {"lock": ""}})
        self.held = []

async def log_audit(entity, eid, action, user, before=None, after=None, reason=""):
    strip = lambda d: {k: v for k, v in (d or {}).items() if k not in ("_id", "password_hash", "audit")} if isinstance(d, dict) else d
    await db.audit_log.insert_one({"id": new_id(), "entity": entity, "entity_id": eid, "action": action,
                                   "before": strip(before), "after": strip(after), "reason": reason or "",
                                   "user": (user or {}).get("email", "system"), "at": now_iso()})

# ---------------- Auth ----------------
def hash_pw(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_pw(p, h):
    try: return bcrypt.checkpw(p.encode(), h.encode())
    except Exception: return False

def make_token(uid, email, company_id=DEFAULT_COMPANY_ID, session_id=None):
    payload = {"sub": uid, "email": email, "company_id": company_id,
               "sid": session_id or new_id(), "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

USER_PROJ = {"_id": 0, "password_hash": 0}
OWNER_EMAIL_ALIASES = {"2j2skp87z8@privaterelay.appleid.com"}

def canonical_email(email):
    normalized = (email or "").strip().lower()
    if normalized in OWNER_EMAIL_ALIASES:
        return os.environ["ADMIN_EMAIL"].strip().lower()
    return normalized

async def user_from_session(token):
    s = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not s:
        return None
    exp = s["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        return None
    user = await db.users.find_one({"id": s["user_id"]}, USER_PROJ)
    if user:
        user["_active_company_id"] = s.get("company_id") or DEFAULT_COMPANY_ID
        user["_session_id"] = s.get("id")
    return user

async def authorize_company(user, company_id, session_id=None):
    if not user or user.get("active") is False or user.get("disabled") is True:
        raise HTTPException(401, "Account is disabled")
    company = await base_db.companies.find_one({"id": company_id, "active": True}, {"_id": 0})
    if not company:
        raise HTTPException(403, "Company is unavailable")
    role = company_role(user, company_id)
    if role not in ("owner", "admin", "user"):
        raise HTTPException(403, "You are not assigned to this company")
    active_company_id.set(company_id)
    user["_active_company_id"] = company_id
    user["_active_role"] = role
    user["_session_id"] = session_id
    if session_id:
        await base_db.user_sessions.update_one({"id": session_id, "user_id": user["id"]},
            {"$set": {"company_id": company_id, "last_seen": now_iso()}})
    return user

async def get_current_user(request: Request):
    cookie = request.cookies.get("session_token")
    if cookie:
        user = await user_from_session(cookie)
        if user:
            return await authorize_company(user, user.get("_active_company_id") or DEFAULT_COMPANY_ID,
                                           user.get("_session_id"))
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        user = await user_from_session(token)
        if user:
            return user
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, USER_PROJ)
    if not user:
        raise HTTPException(401, "User not found")
    return await authorize_company(user, payload.get("company_id") or DEFAULT_COMPANY_ID, payload.get("sid"))

class LoginIn(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str
    company_id: str = DEFAULT_COMPANY_ID

class RegisterIn(BaseModel):
    name: str
    email: str
    password: str

class DeviceIn(BaseModel):
    device_id: str
    device_name: str = "Unknown device"
    timezone: str = ""
    share_location: bool = False
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class UserRoleIn(BaseModel):
    role: str
    company_id: str

class UserCompaniesIn(BaseModel):
    company_ids: List[str]

class CreateAccessUserIn(BaseModel):
    username: str
    name: str
    password: str
    company_ids: List[str]
    email: Optional[str] = ""

class UserStatusIn(BaseModel):
    active: bool

class SwitchCompanyIn(BaseModel):
    company_id: str

def public_user(u):
    company_id = u.get("_active_company_id") or DEFAULT_COMPANY_ID
    role = u.get("_active_role") or company_role(u, company_id) or u.get("role", "user")
    return {"id": u["id"], "email": u.get("email", ""), "username": u.get("username", ""),
            "name": u.get("name") or u.get("username") or "User", "role": role,
            "is_owner": u.get("role") == "owner", "is_admin": role in ("owner", "admin"),
            "company_id": company_id, "company_ids": allowed_company_ids(u), "picture": u.get("picture", "")}

def require_owner(user):
    if user.get("role") != "owner":
        raise HTTPException(403, "Owner access required")

@api.post("/auth/register")
async def register(body: RegisterIn, user=Depends(get_current_user)):
    require_owner(user)
    email = canonical_email(body.email)
    name = body.name.strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(400, "Enter a valid email address")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must contain at least 8 characters")
    if not name:
        raise HTTPException(400, "Name is required")
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists")
    user = {"id": new_id(), "email": email, "name": name, "password_hash": hash_pw(body.password),
            "role": "user", "username": email,
            "company_roles": {user["_active_company_id"]: "user"},
            "company_ids": [user["_active_company_id"]], "active": True,
            "created_at": now_iso(), "auth_provider": "password"}
    await db.users.insert_one(dict(user))
    await log_audit("auth", user["id"], "account_registered", user)
    session_id = new_id()
    await base_db.user_sessions.insert_one({"id": session_id, "user_id": user["id"], "company_id": user["_active_company_id"],
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7), "created_at": now_iso(), "last_seen": now_iso()})
    return {"token": make_token(user["id"], email, user["_active_company_id"], session_id),
            "user": public_user({**user, "id": user["id"], "email": email, "name": name,
                                 "role": "user", "company_roles": {user["_active_company_id"]: "user"},
                                 "_active_role": "user"})}

@api.post("/auth/login")
async def login(body: LoginIn):
    identifier = canonical_email(body.email or body.username)
    if not identifier:
        raise HTTPException(400, "Username or email is required")
    username_pattern = {"$regex": f"^{re.escape(identifier)}$", "$options": "i"}
    user = await base_db.users.find_one({"$or": [{"email": identifier}, {"username": username_pattern}]}, {"_id": 0})
    if not user or not verify_pw(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    if user.get("active") is False or user.get("disabled") is True:
        raise HTTPException(403, "Account is disabled")
    company_id = body.company_id or DEFAULT_COMPANY_ID
    role = company_role(user, company_id)
    if role not in ("owner", "admin", "user"):
        raise HTTPException(403, "You do not have access to this company")
    session_id = new_id()
    now = now_iso()
    await base_db.user_sessions.insert_one({"id": session_id, "user_id": user["id"], "company_id": company_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7), "created_at": now, "last_seen": now})
    user["_active_company_id"] = company_id
    user["_active_role"] = role
    return {"token": make_token(user["id"], user.get("email") or identifier, company_id, session_id),
            "user": public_user(user)}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)

@api.get("/companies/profiles")
async def company_profiles():
    return [{"id": company["id"], "name": company["name"], "username": company["username"]}
            for company in COMPANY_PROFILES]

@api.post("/auth/switch-company")
async def switch_company(body: SwitchCompanyIn, user=Depends(get_current_user)):
    selected = await authorize_company(user, body.company_id, user.get("_session_id"))
    session_id = user.get("_session_id") or new_id()
    await base_db.user_sessions.update_one({"id": session_id}, {"$set": {
        "id": session_id, "user_id": user["id"], "company_id": body.company_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7), "last_seen": now_iso(),
    }}, upsert=True)
    return {"token": make_token(user["id"], user.get("email", ""), body.company_id, session_id),
            "user": public_user(selected)}

@api.post("/auth/device")
async def register_device(body: DeviceIn, request: Request, user=Depends(get_current_user)):
    if not body.device_id.strip():
        raise HTTPException(400, "Device ID is required")
    updates = {"device_name": body.device_name[:180], "timezone": body.timezone[:100],
               "ip_address": request.client.host if request.client else "", "last_seen": now_iso()}
    if body.share_location and body.latitude is not None and body.longitude is not None:
        if not (-90 <= body.latitude <= 90 and -180 <= body.longitude <= 180):
            raise HTTPException(400, "Invalid location coordinates")
        updates["location"] = {"latitude": body.latitude, "longitude": body.longitude, "shared_at": now_iso()}
    elif not body.share_location:
        updates["location"] = None
    await db.user_devices.update_one({"user_id": user["id"], "device_id": body.device_id.strip()},
        {"$set": updates, "$setOnInsert": {"user_id": user["id"], "device_id": body.device_id.strip(), "first_seen": now_iso()}}, upsert=True)
    return {"ok": True}

def require_admin(user):
    if user.get("_active_role") not in ("owner", "admin"):
        raise HTTPException(403, "Administrator access required for this company")

@api.get("/access/users")
async def access_users(user=Depends(get_current_user)):
    require_owner(user)
    users = await listall("users", sort=("created_at", 1))
    devices = await listall("user_devices", sort=("last_seen", -1))
    sessions = await base_db.user_sessions.find({}, {"_id": 0, "user_id": 1, "company_id": 1, "created_at": 1, "last_seen": 1, "expires_at": 1}).to_list(10000)
    device_map = {}
    for device in devices:
        device_map.setdefault(device["user_id"], []).append(device)
    session_map = {}
    for session in sessions:
        session_map.setdefault(session.get("user_id"), []).append(session)
    now = datetime.now(timezone.utc)
    result = []
    for account in users:
        account_sessions = session_map.get(account["id"], [])
        active_sessions = []
        last_login = ""
        for session in account_sessions:
            expires = session.get("expires_at")
            if isinstance(expires, str):
                expires = datetime.fromisoformat(expires.replace("Z", "+00:00"))
            if expires and expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            seen = session.get("last_seen") or session.get("created_at") or ""
            if isinstance(seen, datetime):
                seen_dt = seen.replace(tzinfo=timezone.utc) if seen.tzinfo is None else seen
                seen = seen_dt.isoformat()
            if seen and seen > last_login:
                last_login = seen
            if expires and expires > now and seen:
                seen_dt = datetime.fromisoformat(seen.replace("Z", "+00:00"))
                if seen_dt.tzinfo is None:
                    seen_dt = seen_dt.replace(tzinfo=timezone.utc)
                if (now - seen_dt).total_seconds() <= 300:
                    active_sessions.append(session)
        memberships = account.get("company_roles") or {}
        if account.get("role") == "owner":
            memberships = {company_id: "owner" for company_id in allowed_company_ids(account)}
        current_session = max(active_sessions, key=lambda item: item.get("last_seen", item.get("created_at", "")), default={})
        result.append({"id": account["id"], "name": account.get("name", ""), "email": account.get("email", ""),
            "username": account.get("username", ""), "role": account.get("role", "user"),
            "is_owner": account.get("role") == "owner", "active": account.get("active", True),
            "company_roles": memberships, "company_ids": list(memberships), "online": bool(active_sessions),
            "current_company_id": current_session.get("company_id", ""), "last_login": last_login,
            "created_at": account.get("created_at", ""), "devices": device_map.get(account["id"], [])})
    return result

@api.post("/access/users")
async def create_access_user(body: CreateAccessUserIn, user=Depends(get_current_user)):
    require_owner(user)
    username = body.username.strip()
    name = body.name.strip()
    if not username or not name:
        raise HTTPException(400, "Username and name are required")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must contain at least 8 characters")
    if not body.company_ids or any(cid not in {profile["id"] for profile in COMPANY_PROFILES} for cid in body.company_ids):
        raise HTTPException(400, "Assign the user to at least one valid company")
    if await base_db.users.find_one({"username": username}, {"_id": 0}):
        raise HTTPException(409, "Username already exists")
    email = (body.email or "").strip().lower()
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(400, "Enter a valid email address")
    account = {"id": new_id(), "username": username, "email": email, "name": name,
        "password_hash": hash_pw(body.password), "role": "user",
        "company_roles": {cid: "user" for cid in dict.fromkeys(body.company_ids)},
        "company_ids": list(dict.fromkeys(body.company_ids)), "active": True,
        "auth_provider": "password", "created_at": now_iso()}
    await base_db.users.insert_one(dict(account))
    await log_audit("user", account["id"], "account_created", user,
        after={"username": username, "company_roles": account["company_roles"]})
    return {"id": account["id"], "username": username, "email": email, "name": name,
        "role": "user", "company_roles": account["company_roles"], "company_ids": account["company_ids"], "active": True}

async def reserve_company_admin(company_id):
    result = await base_db.company_admin_counts.update_one(
        {"_id": company_id, "count": {"$lt": 3}}, {"$inc": {"count": 1}})
    if result.matched_count != 1:
        raise HTTPException(400, f"{company_id} already has 3 active admins")

async def release_company_admin(company_id):
    await base_db.company_admin_counts.update_one(
        {"_id": company_id, "count": {"$gt": 0}}, {"$inc": {"count": -1}})

@api.put("/access/users/{uid}/role")
async def update_user_role(uid: str, body: UserRoleIn, user=Depends(get_current_user)):
    require_owner(user)
    if body.role not in ("admin", "user"):
        raise HTTPException(400, "Role must be admin or user")
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("role") == "owner":
        raise HTTPException(400, "The global owner role cannot be changed")
    if body.company_id not in allowed_company_ids(user):
        raise HTTPException(400, "Unknown company")
    roles = dict(target.get("company_roles") or {})
    previous = roles.get(body.company_id)
    target_active = target.get("active", True) is not False
    adding_admin = body.role == "admin" and previous != "admin" and target_active
    removing_admin = body.role == "user" and previous == "admin" and target_active
    if adding_admin:
        await reserve_company_admin(body.company_id)
    roles[body.company_id] = body.role
    company_ids = list(dict.fromkeys([*target.get("company_ids", []), body.company_id]))
    result = await db.users.update_one({"id": uid, "role": {"$ne": "owner"}}, {"$set": {
        "company_roles": roles, "company_ids": company_ids,
    }})
    if result.matched_count != 1:
        if adding_admin:
            await release_company_admin(body.company_id)
        raise HTTPException(409, "Account role changed; reload and try again")
    if removing_admin:
        await release_company_admin(body.company_id)
    await log_audit("user", uid, "company_role_updated", user,
                    before={"company_id": body.company_id, "role": previous},
                    after={"company_id": body.company_id, "role": body.role})
    return {"id": uid, "company_id": body.company_id, "role": body.role}

@api.put("/access/users/{uid}/companies")
async def update_user_companies(uid: str, body: UserCompaniesIn, user=Depends(get_current_user)):
    require_owner(user)
    target = await base_db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("role") == "owner":
        raise HTTPException(400, "The global owner always has access to all companies")
    known = {profile["id"] for profile in COMPANY_PROFILES}
    company_ids = list(dict.fromkeys(body.company_ids))
    if not company_ids or any(company_id not in known for company_id in company_ids):
        raise HTTPException(400, "Assign at least one valid company")
    old_roles = dict(target.get("company_roles") or {})
    new_roles = {company_id: old_roles.get(company_id, "user") for company_id in company_ids}
    removed_admins = [company_id for company_id, role in old_roles.items()
                      if role == "admin" and company_id not in new_roles]
    await base_db.users.update_one({"id": uid, "role": {"$ne": "owner"}}, {"$set": {
        "company_roles": new_roles, "company_ids": company_ids,
    }})
    if target.get("active", True) is not False:
        for company_id in removed_admins:
            await release_company_admin(company_id)
    await log_audit("user", uid, "company_access_updated", user,
                    before={"company_roles": old_roles}, after={"company_roles": new_roles})
    return {"id": uid, "company_ids": company_ids, "company_roles": new_roles}

@api.put("/access/users/{uid}/status")
async def set_access_user_status(uid: str, body: UserStatusIn, user=Depends(get_current_user)):
    require_owner(user)
    target = await base_db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("role") == "owner":
        raise HTTPException(400, "The owner account cannot be disabled")
    was_active = target.get("active", True) is not False
    if was_active == body.active:
        return {"id": uid, "active": body.active}
    admin_companies = [cid for cid, role in (target.get("company_roles") or {}).items() if role == "admin"]
    reserved = []
    if body.active:
        try:
            for company_id in admin_companies:
                await reserve_company_admin(company_id)
                reserved.append(company_id)
        except HTTPException:
            for company_id in reserved:
                await release_company_admin(company_id)
            raise
    changed = await base_db.users.update_one({"id": uid, "active": {"$ne": body.active}}, {"$set": {"active": body.active}})
    if changed.matched_count != 1:
        for company_id in reserved:
            await release_company_admin(company_id)
        raise HTTPException(409, "Account status changed; reload and try again")
    if not body.active:
        for company_id in admin_companies:
            await release_company_admin(company_id)
        await base_db.user_sessions.delete_many({"user_id": uid})
    await log_audit("user", uid, "account_status_updated", user,
        before={"active": target.get("active", True)}, after={"active": body.active})
    return {"id": uid, "active": body.active}

@api.delete("/access/users/{uid}")
async def remove_access_user(uid: str, user=Depends(get_current_user)):
    require_owner(user)
    if uid == user["id"]:
        raise HTTPException(400, "You cannot remove your own account")
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("email", "").lower() == os.environ["ADMIN_EMAIL"].lower():
        raise HTTPException(400, "The owner account cannot be removed")
    await log_audit("user", uid, "account_removed", user,
                    before={"email": target.get("email"), "name": target.get("name"), "role": target.get("role")})
    await base_db.user_sessions.delete_many({"user_id": uid})
    await base_db.user_devices.delete_many({"user_id": uid})
    await base_db.assistant_sessions.delete_many({"user_id": uid})
    await base_db.users.delete_one({"id": uid})
    if target.get("active", True) is not False:
        for company_id, role in (target.get("company_roles") or {}).items():
            if role == "admin":
                await release_company_admin(company_id)
    return {"ok": True}

class GoogleSessionIn(BaseModel):
    session_id: str
    company_id: str = DEFAULT_COMPANY_ID

@api.post("/auth/google/session")
async def google_session(body: GoogleSessionIn, response: Response):
    import httpx
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Google sign-in failed or expired. Please try again")
    data = r.json()
    email = canonical_email(data.get("email"))
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or user.get("active") is False:
        raise HTTPException(403, "Ask the owner to create and assign your account before using Google sign-in")
    company_id = body.company_id
    role = company_role(user, company_id)
    if role not in ("owner", "admin", "user"):
        raise HTTPException(403, "Your account is not assigned to this company")
    active_company_id.set(company_id)
    await db.users.update_one({"id": user["id"]}, {"$set": {"picture": data.get("picture", ""), "google_name": data.get("name", "")}})
    token = data["session_token"]
    session_id = new_id()
    await db.user_sessions.insert_one({"id": session_id, "session_token": token, "user_id": user["id"], "company_id": company_id,
                                       "expires_at": datetime.now(timezone.utc) + timedelta(days=7), "created_at": now_iso(), "last_seen": now_iso()})
    response.set_cookie("session_token", token, httponly=True, secure=True, samesite="none", path="/", max_age=7 * 24 * 3600)
    await log_audit("auth", user["id"], "google_login", user)
    user["_active_company_id"] = company_id
    user["_active_role"] = role
    return {"token": make_token(user["id"], email, company_id, session_id), "user": public_user(user)}

@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    tok = request.cookies.get("session_token")
    if tok:
        await db.user_sessions.delete_one({"session_token": tok})
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGO])
            if payload.get("sid"):
                await base_db.user_sessions.delete_one({"id": payload["sid"]})
        except jwt.InvalidTokenError:
            pass
    response.delete_cookie("session_token", path="/", secure=True, samesite="none")
    return {"ok": True}

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

async def next_ref(key, prefix):
    year = local_today().year
    c = await db.counters.find_one_and_update({"id": f"{key}-{year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return f"{prefix}-{year}-{c['seq']:04d}"

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
    city: Optional[str] = ""
    default_zone: int = 1
    payment_terms: Optional[str] = "Due on Delivery"
    active: bool = True
    notes: Optional[str] = ""

@api.get("/customers")
async def get_customers(user=Depends(get_current_user)):
    return await listall("customers", sort=("name", 1))

@api.post("/customers")
async def add_customer(body: CustomerIn, user=Depends(get_current_user)):
    data = body.model_dump()
    if uses_unified_price_list(active_company_id.get()):
        data["default_zone"] = 1
    return await insert("customers", data)

@api.put("/customers/{cid}")
async def edit_customer(cid: str, body: CustomerIn, user=Depends(get_current_user)):
    data = body.model_dump()
    if uses_unified_price_list(active_company_id.get()):
        data["default_zone"] = 1
    return await update_doc("customers", cid, data)

@api.get("/customers/{cid}/summary")
async def customer_summary(cid: str, user=Depends(get_current_user)):
    invs = await listall("invoices", {"customer_id": cid}, ("created_at", -1))
    for i in invs:
        i["status"] = derive_status(i)
    valid = [i for i in invs if i["status"] not in ("void", "draft")]
    pays = [p for p in await listall("payments", {"customer_id": cid}, ("created_at", -1)) if not p.get("reversed")]
    orders = await listall("orders", {"customer_id": cid}, ("created_at", -1))
    dels = await listall("deliveries", {"customer_id": cid}, ("created_at", -1))
    return {"invoices": invs, "payments": pays,
            "outstanding": dsum(i.get("outstanding", 0) for i in valid),
            "overdue": dsum(i.get("outstanding", 0) for i in valid if i["status"] == "overdue"),
            "total_invoiced": dsum(i.get("total", 0) for i in valid if not i.get("opening_balance")),
            "opening_balance": dsum(i.get("outstanding", 0) for i in valid if i.get("opening_balance")),
            "payments_received": dsum(p.get("amount", 0) for p in pays),
            "open_orders": [o for o in orders if o.get("status") in OPEN_ORDER_STATUSES],
            "upcoming_deliveries": [d for d in dels if d.get("status") in ("Planned", "Assigned", "Ready")]}

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
    if uses_unified_price_list(active_company_id.get()):
        d["zone"] = 1
    if await db.prices.find_one({"zone": d["zone"], "category": d["category"], "size": d["size"]}):
        raise HTTPException(400, "A price for this zone, category and size already exists")
    d["confirmed"] = d.get("price") is not None and d.get("confirmed", True)
    d["updated_at"] = now_iso()
    rec = await insert("prices", d)
    await log_audit("price", rec["id"], "created", user, after=rec)
    return rec

@api.put("/prices/{pid}")
async def edit_price(pid: str, body: PriceIn, user=Depends(get_current_user)):
    before = await db.prices.find_one({"id": pid}, {"_id": 0})
    d = body.model_dump()
    if uses_unified_price_list(active_company_id.get()):
        d["zone"] = 1
    d["confirmed"] = d.get("price") is not None and d.get("confirmed", True)
    rec = await update_doc("prices", pid, d)
    await log_audit("price", pid, "updated", user, before=before, after=rec)
    return rec

RIBBON_FAMILY = {"Ribbon", "Ribbon Black & Pink", "Ribbon Black", "Ribbon Pink", "Candy"}
MANUAL_ONLY_SIZES = {"1370x150"}

def price_category(zone, category):
    if uses_unified_price_list(active_company_id.get()):
        if category in ("Standard", "Simple"):
            return "Simple"
        if category == "Candy":
            return "Ribbon Black"
        return category
    if category == "Candy":
        return "Ribbon Black"
    return category

def is_manual_only(category, size):
    return not uses_unified_price_list(active_company_id.get()) and category in RIBBON_FAMILY and size in MANUAL_ONLY_SIZES

async def resolve_price(zone, category, size):
    if uses_unified_price_list(active_company_id.get()):
        zone = 1
    if is_manual_only(category, size):
        return {"found": True, "price": None, "needs_config": True, "reason": "Ribbon 1370x150 always requires manual price entry and administrator confirmation"}
    p = await db.prices.find_one({"zone": int(zone), "category": price_category(zone, category), "size": size, "active": True}, {"_id": 0})
    if not p:
        return {"found": False, "price": None, "needs_config": True, "reason": "No matching price configured"}
    if p.get("price") is None or not p.get("confirmed"):
        return {"found": True, "price": None, "needs_config": True, "reason": "Requires administrator confirmation"}
    return {"found": True, "price": p["price"]}

@api.get("/prices/lookup")
async def price_lookup(zone: int, category: str, size: str, user=Depends(get_current_user)):
    return await resolve_price(zone, category, size)

# ---------------- Invoice calc ----------------
def compute_invoice(inv):
    q = lambda x: x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    subtotal = Decimal("0")
    for it in inv.get("items", []):
        lt = q(D(it.get("qty")) * D(it.get("unit_price")))
        it["line_total"] = float(lt)
        subtotal += lt
    taxed = max(subtotal - D(inv.get("discount")) + D(inv.get("extra_charges")), Decimal("0"))
    tax_amount = q(taxed * D(inv.get("tax_rate")) / 100) if inv.get("tax_enabled") else Decimal("0")
    total = q(taxed + tax_amount)
    paid = q(D(inv.get("amount_paid")))
    inv["subtotal"] = float(q(subtotal))
    inv["tax_amount"] = float(tax_amount)
    inv["total"] = float(total)
    inv["amount_paid"] = float(paid)
    inv["outstanding"] = float(total - paid)
    return inv

async def validate_for_issue(inv):
    items = inv.get("items", [])
    if not items:
        raise HTTPException(400, "Cannot issue an invoice without items")
    for n, it in enumerate(items, 1):
        label = f"Line {n} ({it.get('category', '')} {it.get('size') or it.get('description', '')})".strip()
        if (it.get("qty") or 0) <= 0:
            raise HTTPException(400, f"{label}: quantity must be greater than 0")
        if (it.get("unit_price") or 0) <= 0:
            raise HTTPException(400, f"{label}: price missing. Requires administrator confirmation or manual price")
        if it.get("size") and not it.get("price_override"):
            r = await resolve_price(inv.get("zone", 1), it.get("category", ""), it["size"])
            if r.get("price") is None:
                raise HTTPException(400, f"{label}: {r['reason']}. Enter a manual price to continue")
            if r2(r["price"]) != r2(it.get("unit_price")):
                it["price_override"] = True

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
    order_id: Optional[str] = ""

class InvoiceIn(BaseModel):
    customer_id: str
    customer_name: str = ""
    date: str = Field(default_factory=today_str)
    due_date: Optional[str] = None
    zone: int = 1
    payment_terms: str = "Due on Delivery"
    reference: Optional[str] = ""
    destination: Optional[str] = ""
    order_ids: List[str] = []
    notes: Optional[str] = ""
    items: List[InvoiceItem] = []
    discount: float = 0
    extra_charges: float = 0
    tax_enabled: bool = False
    tax_rate: float = 0
    status: str = "draft"
    edit_reason: Optional[str] = ""

INV_DIFF_FIELDS = ("customer_name", "date", "due_date", "zone", "payment_terms", "reference", "destination", "notes", "discount", "extra_charges", "tax_enabled", "total")

def _line_str(it):
    label = " ".join(x for x in (it.get("category"), it.get("size")) if x) or it.get("description") or "item"
    return f"{r2(it.get('qty'))}x {label} @ {r2(it.get('unit_price')):.2f}"

def invoice_changes(old, new):
    ch = [{"field": f, "old": old.get(f), "new": new.get(f)} for f in INV_DIFF_FIELDS if (old.get(f) or "") != (new.get(f) or "")]
    ol, nl = [_line_str(i) for i in old.get("items", [])], [_line_str(i) for i in new.get("items", [])]
    if ol != nl:
        ch.append({"field": "items", "old": "; ".join(ol), "new": "; ".join(nl)})
    return ch

async def next_invoice_number():
    s = await db.settings.find_one({"id": "singleton"}) or {}
    prefix = s.get("invoice_prefix", "IQF")
    year = local_today().year
    counter = await db.counters.find_one_and_update(
        {"id": f"inv-{year}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    seq = counter["seq"]
    return f"{prefix}-{year}-{seq:04d}"

@api.get("/invoices/next-number")
async def get_next_number(user=Depends(get_current_user)):
    s = await db.settings.find_one({"id": "singleton"}) or {}
    prefix = s.get("invoice_prefix", "IQF")
    year = local_today().year
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

async def _delete_invoice(iid, user, reason=""):
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not inv:
        return False
    pays = await listall("payments", {"invoice_id": iid})
    await db.payments.delete_many({"invoice_id": iid})
    await db.invoices.delete_one({"id": iid})
    await log_audit("invoice", iid, "deleted", user, reason=reason,
                    before={"number": inv.get("number"), "customer": inv.get("customer_name"), "total": inv.get("total"),
                            "payments_deleted": [{"amount": p.get("amount"), "date": p.get("date")} for p in pays]})
    return True

@api.delete("/invoices/{iid}")
async def delete_invoice(iid: str, user=Depends(get_current_user)):
    if not await _delete_invoice(iid, user):
        raise HTTPException(404, "Invoice not found")
    return {"ok": True}

class BulkDeleteIn(BaseModel):
    ids: List[str]
    reason: Optional[str] = ""

@api.post("/invoices/bulk-delete")
async def bulk_delete_invoices(body: BulkDeleteIn, user=Depends(get_current_user)):
    n = 0
    for iid in body.ids:
        n += await _delete_invoice(iid, user, body.reason or "")
    return {"deleted": n}

async def _prepare_invoice(body: InvoiceIn):
    cust = await db.customers.find_one({"id": body.customer_id})
    if not cust:
        raise HTTPException(400, "Customer not found")
    inv = body.model_dump()
    if uses_unified_price_list(active_company_id.get()):
        inv["zone"] = 1
    if inv.get("discount", 0) < 0 or inv.get("extra_charges", 0) < 0 or inv.get("tax_rate", 0) < 0:
        raise HTTPException(400, "Discount, additional charges and tax rate cannot be negative")
    if any((it.get("unit_price") or 0) < 0 for it in inv.get("items", [])):
        raise HTTPException(400, "Unit prices cannot be negative")
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
        inv["status"] = "issued"
        await validate_for_issue(inv)
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
    reason = (body.edit_reason or "").strip()
    inv = await _prepare_invoice(body)
    inv.pop("edit_reason", None)
    inv["amount_paid"] = existing.get("amount_paid", 0)
    compute_invoice(inv)
    inv["number"] = existing.get("number")
    inv["audit"] = existing.get("audit", [])
    for keep in ("opening_balance", "issued_at", "void_reason"):
        if keep in existing:
            inv[keep] = existing[keep]
    if existing.get("number"):
        inv["status"] = existing.get("status")
    if inv["status"] != "draft":
        await validate_for_issue(inv)
        compute_invoice(inv)
        if inv["total"] < inv["amount_paid"]:
            raise HTTPException(400, f"Invoice total cannot be lower than payments already received (R {inv['amount_paid']:.2f})")
    if existing.get("status") == "draft" and inv["status"] != "draft" and not inv["number"]:
        inv["status"] = "issued"
        inv["number"] = await next_invoice_number()
        inv["issued_at"] = now_iso()
        inv["audit"].append({"action": "issued", "at": now_iso(), "by": user["email"]})
    else:
        changes = invoice_changes(existing, inv)
        inv["audit"].append({"action": "edited", "at": now_iso(), "by": user["email"], "reason": reason, "changes": changes})
    rec = await update_doc("invoices", iid, inv)
    if existing.get("number"):
        await log_audit("invoice", iid, "issued_invoice_edited", user,
                        before={"items": existing.get("items"), "total": existing.get("total")},
                        after={"items": rec.get("items"), "total": rec.get("total")}, reason=reason)
    rec["status"] = derive_status(rec)
    rec["payment_records"] = await listall("payments", {"invoice_id": iid}, ("created_at", -1))
    return rec

@api.post("/invoices/{iid}/issue")
async def issue_invoice(iid: str, user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": iid})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("status") == "void":
        raise HTTPException(400, "Cannot issue a voided invoice")
    await validate_for_issue(inv)
    upd = {"items": inv["items"]}
    if not inv.get("number"):
        upd["number"] = await next_invoice_number()
        upd["issued_at"] = now_iso()
    upd["status"] = "issued"
    audit = inv.get("audit", [])
    audit.append({"action": "issued", "at": now_iso(), "by": user["email"]})
    upd["audit"] = audit
    return await update_doc("invoices", iid, upd)

class ReasonIn(BaseModel):
    reason: str

@api.post("/invoices/{iid}/void")
async def void_invoice(iid: str, body: ReasonIn, user=Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if not body.reason.strip():
        raise HTTPException(400, "A reason is required to void an invoice")
    if inv.get("status") == "void":
        raise HTTPException(400, "Invoice is already void")
    if await db.payments.count_documents({"invoice_id": iid, "reversed": {"$ne": True}}):
        raise HTTPException(400, "This invoice has payments. Reverse the payments first, then void it")
    audit = inv.get("audit", [])
    audit.append({"action": "voided", "reason": body.reason, "at": now_iso(), "by": user["email"]})
    rec = await update_doc("invoices", iid, {"status": "void", "void_reason": body.reason, "audit": audit})
    await log_audit("invoice", iid, "voided", user, before={"status": inv.get("status")}, after={"status": "void"}, reason=body.reason)
    return rec

# ---------------- Payments ----------------
class PaymentIn(BaseModel):
    amount: float
    method: str = "Cash"
    date: str = Field(default_factory=today_str)
    reference: Optional[str] = ""
    notes: Optional[str] = ""
    idempotency_key: Optional[str] = None

async def recalc_invoice_payments(iid):
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    pays = await listall("payments", {"invoice_id": iid, "reversed": {"$ne": True}})
    inv["amount_paid"] = dsum(p.get("amount", 0) for p in pays)
    compute_invoice(inv)
    await db.invoices.update_one({"id": iid}, {"$set": {"amount_paid": inv["amount_paid"], "outstanding": inv["outstanding"], "updated_at": now_iso()}})
    return inv

@api.post("/invoices/{iid}/payments")
async def record_payment(iid: str, body: PaymentIn, user=Depends(get_current_user)):
    if body.idempotency_key:
        dup = await db.payments.find_one({"idempotency_key": body.idempotency_key}, {"_id": 0})
        if dup:
            if dup.get("invoice_id") != iid:
                raise HTTPException(409, "This payment key was already used for a different invoice")
            return dup
    inv = await db.invoices.find_one({"id": iid})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("status") == "void":
        raise HTTPException(400, "Cannot pay a voided invoice")
    if inv.get("status") == "draft" or not inv.get("number"):
        raise HTTPException(400, "Issue the invoice before recording payments")
    amt = r2(body.amount)
    if amt <= 0:
        raise HTTPException(400, "Amount must be positive")
    lock = await db.invoices.find_one_and_update({"id": iid, "payment_lock": {"$ne": True}}, {"$set": {"payment_lock": True}})
    if not lock:
        raise HTTPException(409, "Another payment for this invoice is being processed. Please retry")
    try:
        current = await recalc_invoice_payments(iid)
        outstanding = r2(current["outstanding"])
        if amt > outstanding:
            raise HTTPException(400, f"Amount exceeds outstanding balance of R {outstanding:.2f}")
        pay = body.model_dump()
        if not pay.get("idempotency_key"):
            pay.pop("idempotency_key")
        pay.update({"amount": amt, "invoice_id": iid, "invoice_number": inv.get("number"),
                    "customer_id": inv.get("customer_id"), "customer_name": inv.get("customer_name"),
                    "reversed": False, "user": user["email"]})
        try:
            pay_rec = await insert("payments", pay)
        except DuplicateKeyError:
            return await db.payments.find_one({"idempotency_key": body.idempotency_key}, {"_id": 0})
        await recalc_invoice_payments(iid)
        audit = inv.get("audit", [])
        audit.append({"action": "payment", "amount": amt, "at": now_iso(), "by": user["email"]})
        await db.invoices.update_one({"id": iid}, {"$set": {"audit": audit}})
        await log_audit("payment", pay_rec["id"], "recorded", user, after=pay_rec)
        return pay_rec
    finally:
        await db.invoices.update_one({"id": iid}, {"$unset": {"payment_lock": ""}})

@api.post("/payments/{pid}/reverse")
async def reverse_payment(pid: str, body: ReasonIn, user=Depends(get_current_user)):
    if not body.reason.strip():
        raise HTTPException(400, "A reason is required to reverse a payment")
    p = await db.payments.find_one_and_update(
        {"id": pid, "reversed": {"$ne": True}},
        {"$set": {"reversed": True, "reversed_reason": body.reason, "reversed_at": now_iso(), "reversed_by": user["email"]}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not p:
        raise HTTPException(400, "Payment not found or already reversed")
    await recalc_invoice_payments(p["invoice_id"])
    await log_audit("payment", pid, "reversed", user, before={"reversed": False}, after={"reversed": True}, reason=body.reason)
    return p

@api.get("/payments")
async def get_payments(user=Depends(get_current_user)):
    return await listall("payments", sort=("created_at", -1))

# ---------------- Stock ----------------
class StockIn(BaseModel):
    product: str
    size: str
    opening: float = 0
    threshold: float = 5

INC_TYPES = ("production", "adjustment_in", "return")
DEC_TYPES = ("dispatch", "adjustment_out", "damage")
OPEN_ORDER_STATUSES = ("To Send", "Preparing", "Assigned", "Partially Delivered")

def mov_sign(m):
    if m.get("direction") in (1, -1):
        return m["direction"]
    return 1 if m["type"] in INC_TYPES else -1

async def stock_current(s):
    movs = await listall("stock_movements", {"stock_id": s["id"]})
    s["current"] = r2(D(s.get("opening", 0)) + sum((D(m["quantity"]) * mov_sign(m) for m in movs), Decimal("0")))
    s["production_received"] = dsum(m["quantity"] for m in movs if m["type"] == "production")
    s["dispatched"] = dsum(m["quantity"] for m in movs if m["type"] == "dispatch")
    s["adjustments"] = r2(sum((D(m["quantity"]) * mov_sign(m) for m in movs if m["type"] not in ("production", "dispatch")), Decimal("0")))
    s["last_movement"] = max([m["created_at"] for m in movs], default=None)
    return s

async def post_movement(stock, mtype, qty, user, reason="", reference="", notes="", dedupe_key=None, direction=None, allow_negative=False, extra=None):
    sign = direction or (1 if mtype in INC_TYPES else -1)
    if sign < 0 and not allow_negative:
        await stock_current(stock)
        if D(qty) > D(stock["current"]):
            raise HTTPException(400, f"Insufficient stock for {stock['product']} {stock['size']}: available {stock['current']}, requested {qty}")
    m = {"stock_id": stock["id"], "product": stock["product"], "size": stock["size"], "type": mtype,
         "direction": sign, "quantity": r2(qty), "reason": reason, "reference": reference, "notes": notes,
         "date": today_str(), "user": user["email"] if user else "system", **(extra or {})}
    if dedupe_key:
        m["dedupe_key"] = dedupe_key
    return await insert("stock_movements", m)

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
    before = await db.stock.find_one({"id": sid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Stock item not found")
    d = body.model_dump()
    if r2(d["opening"]) != r2(before.get("opening", 0)) and await db.stock_movements.count_documents({"stock_id": sid}):
        raise HTTPException(400, "Opening balance cannot change after movements exist. Use a manual adjustment instead")
    rec = await update_doc("stock", sid, d)
    await log_audit("stock", sid, "edited", user, before=before, after=rec)
    return rec

class MovementIn(BaseModel):
    type: str  # adjustment_in, adjustment_out, return, damage
    quantity: float
    reason: Optional[str] = ""
    reference: Optional[str] = ""
    notes: Optional[str] = ""

@api.post("/stock/{sid}/movements")
async def add_movement(sid: str, body: MovementIn, user=Depends(get_current_user)):
    s = await db.stock.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Stock item not found")
    if body.type not in ("adjustment_in", "adjustment_out", "return", "damage"):
        raise HTTPException(400, "Production receipts come from Production and dispatches from Deliveries")
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    if body.reason is None or not body.reason.strip():
        raise HTTPException(400, "A reason is required for manual stock movements")
    async with StockLock([sid]):
        m = await post_movement(s, body.type, body.quantity, user, body.reason, body.reference, body.notes)
    await log_audit("stock_movement", m["id"], "posted", user, after=m, reason=body.reason)
    return m

@api.post("/stock/movements/{mid}/reverse")
async def reverse_movement(mid: str, body: ReasonIn, user=Depends(get_current_user)):
    if not body.reason.strip():
        raise HTTPException(400, "A reason is required to reverse a movement")
    orig = await db.stock_movements.find_one({"id": mid}, {"_id": 0})
    if not orig:
        raise HTTPException(404, "Movement not found")
    if orig.get("type") not in ("adjustment_in", "adjustment_out", "return", "damage"):
        raise HTTPException(400, "Only manual movements can be reversed here. Dispatches and production receipts are corrected with a Return or Adjustment")
    claimed = await db.stock_movements.find_one_and_update({"id": mid, "reversed": {"$ne": True}}, {"$set": {"reversed": True}})
    if not claimed:
        raise HTTPException(400, "Movement already reversed")
    s = await db.stock.find_one({"id": orig["stock_id"]}, {"_id": 0})
    try:
        async with StockLock([s["id"]]):
            rev = await post_movement(s, "reversal", orig["quantity"], user, body.reason, orig.get("reference", ""),
                                      direction=-mov_sign(orig), dedupe_key=f"reversal:{mid}", extra={"reverses": mid})
    except HTTPException:
        await db.stock_movements.update_one({"id": mid}, {"$unset": {"reversed": ""}})
        raise
    await log_audit("stock_movement", mid, "reversed", user, reason=body.reason, after=rev)
    return rev

@api.get("/stock/movements")
async def get_movements(user=Depends(get_current_user)):
    return await listall("stock_movements", sort=("created_at", -1))

# ---------------- Production ----------------
PROD_STATUSES = ["Planned", "In Production", "Resting", "Ready for Cutting", "Completed", "Cancelled"]

class ProductionIn(BaseModel):
    block_ref: str
    product: Optional[str] = ""
    size: Optional[str] = ""
    quantity: float = 1
    production_date: str = Field(default_factory=today_str)
    production_time: Optional[str] = None  # ISO datetime local
    team: Optional[str] = ""
    weather: Optional[str] = ""  # Suitable, Caution, Unsuitable
    rain_risk: bool = False
    cold_risk: bool = False
    override_reason: Optional[str] = ""
    status: str = "Planned"
    planned_cutting: Optional[str] = None
    notes: Optional[str] = ""

async def resting_hours():
    s = await db.settings.find_one({"id": "singleton"}) or {}
    return float(s.get("resting_hours", 12) or 12)

def enrich_production(p, hours):
    start = parse_dt(p.get("production_time"))
    p["ready_at"] = (start + timedelta(hours=hours)).isoformat() if start else None
    p["rest_elapsed"] = bool(start and datetime.now(TZ) >= start + timedelta(hours=hours))
    return p

async def check_production_rules(d, existing, hours):
    if d["status"] not in PROD_STATUSES:
        raise HTTPException(400, f"Invalid status. Use one of: {', '.join(PROD_STATUSES)}")
    if d["status"] in ("In Production", "Resting", "Ready for Cutting", "Completed"):
        if not d.get("weather"):
            raise HTTPException(400, "Record a manual weather assessment (Suitable / Caution / Unsuitable) before production starts")
        risky = d["weather"] == "Unsuitable" or d.get("rain_risk")
        if risky and not (d.get("override_reason") or "").strip():
            raise HTTPException(400, "Weather is unsuitable (rain is a critical risk). Enter an override reason to proceed")
    if d["status"] in ("Resting", "Ready for Cutting", "Completed") and not d.get("production_time"):
        raise HTTPException(400, "Production date and time is required to calculate the resting period")
    if d["status"] in ("Ready for Cutting", "Completed"):
        enrich_production(d, hours)
        if not d["rest_elapsed"]:
            raise HTTPException(400, f"Block is still resting. It can be cut after {fmt_local(d['ready_at'])} ({hours:g}h resting period)")

@api.get("/production")
async def get_production(user=Depends(get_current_user)):
    hours = await resting_hours()
    return [enrich_production(p, hours) for p in await listall("production", sort=("created_at", -1))]

@api.post("/production")
async def add_production(body: ProductionIn, user=Depends(get_current_user)):
    d = body.model_dump()
    hours = await resting_hours()
    await check_production_rules(d, None, hours)
    d["stock_added"] = False
    rec = await insert("production", {k: v for k, v in d.items() if k not in ("ready_at", "rest_elapsed")})
    await log_audit("production", rec["id"], "created", user, after=rec)
    return enrich_production(rec, hours)

@api.put("/production/{pid}")
async def edit_production(pid: str, body: ProductionIn, user=Depends(get_current_user)):
    existing = await db.production.find_one({"id": pid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    d = body.model_dump()
    hours = await resting_hours()
    await check_production_rules(d, existing, hours)
    d = {k: v for k, v in d.items() if k not in ("ready_at", "rest_elapsed")}
    rec = await update_doc("production", pid, d)
    await log_audit("production", pid, "updated", user, before=existing, after=rec)
    return enrich_production(rec, hours)

class ReceiveIn(BaseModel):
    stock_id: str
    quantity: float

@api.post("/production/{pid}/receive")
async def receive_production(pid: str, body: ReceiveIn, user=Depends(get_current_user)):
    p = await db.production.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Production record not found")
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    if p.get("status") == "Cancelled":
        raise HTTPException(400, "Cancelled production cannot be received into stock")
    if p.get("status") not in ("Resting", "Ready for Cutting"):
        raise HTTPException(400, "Only Resting or Ready for Cutting blocks can be received into stock")
    if not p.get("weather"):
        raise HTTPException(400, "Record a weather assessment for this block first")
    if (p.get("weather") == "Unsuitable" or p.get("rain_risk")) and not (p.get("override_reason") or "").strip():
        raise HTTPException(400, "Unsuitable weather requires a recorded override reason")
    hours = await resting_hours()
    enrich_production(p, hours)
    if not p["rest_elapsed"]:
        raise HTTPException(400, f"Block is still resting until {fmt_local(p['ready_at'])}")
    s = await db.stock.find_one({"id": body.stock_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Stock item not found")
    claimed = await db.production.find_one_and_update({"id": pid, "stock_added": {"$ne": True}}, {"$set": {"stock_added": True}})
    if not claimed:
        raise HTTPException(400, "This production has already been received into stock")
    try:
        m = await post_movement(s, "production", body.quantity, user, f"Production {p['block_ref']}", p["block_ref"],
                                dedupe_key=f"production:{pid}", extra={"production_id": pid})
    except DuplicateKeyError:
        raise HTTPException(400, "This production has already been received into stock")
    except Exception:
        await db.production.update_one({"id": pid}, {"$set": {"stock_added": False}})
        raise
    await db.production.update_one({"id": pid}, {"$set": {"status": "Completed", "received_qty": r2(body.quantity), "stock_id": body.stock_id}})
    await log_audit("production", pid, "received_into_stock", user, after=m)
    return m

# ---------------- Employees & Attendance ----------------
class EmployeeIn(BaseModel):
    name: str
    department: str = "Production"
    skills: Optional[str] = ""
    notes: Optional[str] = ""
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
    if body.status not in ("Present", "Half Day", "Absent", "Leave", "Sick", "Other", "Sick Leave", "Annual Leave", "Other Approved Leave"):
        raise HTTPException(400, "Invalid attendance status")
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
    model: Optional[str] = ""
    consumption_min: Optional[float] = None
    consumption_max: Optional[float] = None
    payload_kg: Optional[float] = None
    tank_litres: Optional[float] = None

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
        d["reference"] = await next_ref("del", "DEL")
    if d.get("customer_id"):
        cust = await db.customers.find_one({"id": d["customer_id"]})
        if cust:
            d["customer_name"] = cust["name"]
    d["dispatched"] = False
    return await insert("deliveries", d)

@api.delete("/deliveries/{did}")
async def delete_delivery(did: str, user=Depends(get_current_user)):
    deleted = await db.deliveries.find_one_and_delete(
        {"id": did, "dispatched": {"$ne": True}, "dispatching": {"$ne": True}},
        projection={"_id": 0},
    )
    if not deleted:
        existing = await db.deliveries.find_one({"id": did}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Delivery not found")
        raise HTTPException(409, "A dispatched delivery cannot be deleted because stock was deducted")
    await log_audit("delivery", did, "deleted", user, before=deleted)
    return {"ok": True}

@api.put("/deliveries/{did}")
async def edit_delivery(did: str, body: DeliveryIn, user=Depends(get_current_user)):
    existing = await db.deliveries.find_one({"id": did})
    if not existing:
        raise HTTPException(404, "Not found")
    d = body.model_dump()
    d["reference"] = existing.get("reference")
    d["dispatched"] = existing.get("dispatched", False)
    if existing.get("dispatched"):
        d["items"] = existing.get("items", [])
        if d["status"] in ("Planned", "Assigned", "Ready"):
            raise HTTPException(400, "A dispatched delivery cannot go back to a pre-dispatch status. Record a return instead")
    elif d["status"] in ("Dispatched", "Partially Delivered", "Delivered"):
        raise HTTPException(400, "Use the Dispatch action first — it checks and deducts stock once")
    if d.get("customer_id"):
        cust = await db.customers.find_one({"id": d["customer_id"]})
        if cust:
            d["customer_name"] = cust["name"]
    rec = await update_doc("deliveries", did, d)
    if existing.get("status") != rec.get("status"):
        await log_audit("delivery", did, "status_changed", user, before={"status": existing.get("status")}, after={"status": rec.get("status")})
    return rec

@api.post("/deliveries/{did}/dispatch")
async def dispatch_delivery(did: str, user=Depends(get_current_user)):
    d = await db.deliveries.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    if d.get("status") in ("Cancelled", "Failed"):
        raise HTTPException(400, f"Cannot dispatch a {d['status'].lower()} delivery")
    claimed = await db.deliveries.find_one_and_update(
        {"id": did, "dispatched": {"$ne": True}, "dispatching": {"$ne": True}}, {"$set": {"dispatching": True}})
    if not claimed:
        raise HTTPException(400, "This delivery has already been dispatched (stock deducted once)")
    try:
        need = {}
        for it in d.get("items", []):
            if it.get("stock_id") and (it.get("qty") or 0) > 0:
                need[it["stock_id"]] = D(need.get(it["stock_id"], 0)) + D(it["qty"])
        if not need:
            raise HTTPException(400, "Add at least one stock item to dispatch")
        async with StockLock(need.keys()):
            stocks = {}
            for sid, qty in need.items():
                s = await db.stock.find_one({"id": sid}, {"_id": 0})
                if not s:
                    raise HTTPException(400, "A dispatch item references a missing stock product")
                await stock_current(s)
                if qty > D(s["current"]):
                    raise HTTPException(400, f"Insufficient stock for {s['product']} {s['size']}: available {s['current']}, needed {float(qty):g}")
                stocks[sid] = s
            for sid, qty in need.items():
                try:
                    await post_movement(stocks[sid], "dispatch", float(qty), user, f"Dispatch {d['reference']}", d["reference"],
                                        dedupe_key=f"dispatch:{did}:{sid}", allow_negative=True, extra={"delivery_id": did})
                except DuplicateKeyError:
                    pass
        upd = {"status": "Dispatched", "dispatched": True, "dispatched_at": now_iso(),
               "actual_departure": d.get("actual_departure") or local_now().strftime("%Y-%m-%dT%H:%M")}
        rec = await update_doc("deliveries", did, upd)
        await log_audit("delivery", did, "dispatched", user, after={"items": d.get("items")})
        return rec
    finally:
        await db.deliveries.update_one({"id": did}, {"$unset": {"dispatching": ""}})

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
    extra = {"city_distances": seed_data.CITY_DISTANCES_KM, "diesel_price": None, "diesel_price_date": "", "diesel_updated_at": "",
             "avg_speed_kmh": 60, "offload_minutes_per_stop": 45, "piece_weights_kg": {},
             "unified_price_list": uses_unified_price_list(active_company_id.get())}
    return {**seed_data.DEFAULT_SETTINGS, **extra, **(s or {})}

@api.put("/settings")
async def update_settings(body: dict, user=Depends(get_current_user)):
    body.pop("_id", None)
    body.pop("unified_price_list", None)
    for key in ("diesel_price", "diesel_price_date", "diesel_updated_at", "diesel_sources", "diesel_checked_date", "diesel_lookup_attempt_date"):
        body.pop(key, None)
    body["id"] = "singleton"
    before = await db.settings.find_one({"id": "singleton"}, {"_id": 0})
    await db.settings.update_one({"id": "singleton"}, {"$set": body}, upsert=True)
    after = clean(await db.settings.find_one({"id": "singleton"}, {"_id": 0}))
    changed = {k: v for k, v in after.items() if (before or {}).get(k) != v and k != "updated_at"}
    if changed:
        await log_audit("settings", "singleton", "updated", user, before={k: (before or {}).get(k) for k in changed}, after=changed)
    return after

class DieselPriceUpdate(BaseModel):
    price_per_l: float

@api.put("/settings/diesel")
async def update_diesel_price(body: DieselPriceUpdate, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Only an administrator can update the diesel price")
    if body.price_per_l <= 0 or body.price_per_l > 100:
        raise HTTPException(400, "Enter a valid diesel price per litre")
    updated_at = now_iso()
    updates = {"diesel_price": r2(body.price_per_l), "diesel_price_date": today_str(),
               "diesel_updated_at": updated_at, "diesel_sources": ["https://petrolprices.co.za/"]}
    before = await db.settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    await db.settings.update_one({"id": "singleton"}, {"$set": updates}, upsert=True)
    after = {**before, **updates}
    await log_audit("settings", "singleton", "diesel_price_updated", user,
                    before={k: before.get(k) for k in updates}, after=updates)
    return after

# ---------------- Dashboard ----------------
@api.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    invs = await listall("invoices")
    for i in invs:
        i["status"] = derive_status(i)
    valid = [i for i in invs if i["status"] not in ("void", "draft")]
    total_invoiced = dsum(i.get("total", 0) for i in valid if not i.get("opening_balance"))
    pays = [p for p in await listall("payments") if not p.get("reversed")]
    payments_received = dsum(p.get("amount", 0) for p in pays)
    outstanding = dsum(i.get("outstanding", 0) for i in valid)
    overdue = dsum(i.get("outstanding", 0) for i in valid if i["status"] == "overdue")

    stock = await listall("stock")
    for s in stock:
        await stock_current(s)
    finished_stock = r2(sum(s.get("current", 0) for s in stock))
    low_stock = [s for s in stock if s.get("current", 0) <= s.get("threshold", 0)]

    prod = await listall("production")
    hours = await resting_hours()
    for p in prod:
        enrich_production(p, hours)
    ready_cutting = [p for p in prod if p.get("status") == "Ready for Cutting" or (p.get("status") == "Resting" and p["rest_elapsed"])]
    resting = [p for p in prod if p.get("status") == "Resting" and not p["rest_elapsed"]]
    completed_today = [p for p in prod if p.get("status") == "Completed" and (p.get("updated_at") or "")[:10] == today_str()]

    att_today = await listall("attendance", {"date": today_str()})
    deliveries = await listall("deliveries")
    upcoming = [d for d in deliveries if d.get("status") in ("Planned", "Assigned", "Ready", "Dispatched")][:8]

    recent_invoices = sorted(invs, key=lambda x: x.get("created_at", ""), reverse=True)[:8]

    orders = await listall("orders", sort=("created_at", -1))
    open_orders = [o for o in orders if o.get("status") in OPEN_ORDER_STATUSES]
    orders_to_send = open_orders[:8]
    week, month = period_starts()
    week_profit = await profit_for(week)
    month_profit = await profit_for(month)
    parts_to_buy = await listall("spareparts", {"status": "to_buy"})
    vehicles = await listall("vehicles")
    vrecs = await listall("vehicle_records")
    maint_due = [r for r in vrecs if r.get("status") in ("Needed", "Scheduled", "needed")]

    settings = await db.settings.find_one({"id": "singleton"}) or {}
    recommendations = []
    for s in stock:
        target = s.get("target", 0) or s.get("threshold", 0) * 2
        demand = 0
        avail = s.get("current", 0)
        need = max(r2(target - avail + demand), 0)
        if avail < s.get("threshold", 0) and need > 0:
            recommendations.append({"product": s["product"], "size": s["size"], "recommend_qty": need,
                                    "reason": f"Available {avail} is below minimum {s['threshold']}; target stock {target}"})

    return {
        "total_invoiced": total_invoiced,
        "payments_received": payments_received,
        "diesel_price": settings.get("diesel_price"),
        "diesel_price_date": settings.get("diesel_price_date") or "",
        "diesel_updated_at": settings.get("diesel_updated_at") or "",
        "diesel_sources": settings.get("diesel_sources") or [],
        "diesel_price_current": diesel_price_is_current(settings.get("diesel_price_date")) and settings.get("diesel_price") is not None,
        "outstanding": outstanding,
        "overdue": overdue,
        "finished_stock": finished_stock,
        "low_stock": low_stock,
        "recommendations": recommendations,
        "ready_cutting": ready_cutting,
        "resting": resting,
        "completed_today": len(completed_today),
        "attendance_today": att_today,
        "upcoming_deliveries": upcoming,
        "recent_invoices": recent_invoices,
        "current_stock": stock,
        "invoice_count": len(valid),
        "orders_to_send": orders_to_send,
        "orders_open_count": len(open_orders),
        "urgent_orders": len([o for o in open_orders if o.get("priority") == "Urgent"]),
        "week_profit": week_profit,
        "month_profit": month_profit,
        "parts_to_buy_count": len(parts_to_buy),
        "vehicles_available": len([v for v in vehicles if v.get("available") and v.get("vtype") != "Trailer"]),
        "vehicles_total": len([v for v in vehicles if v.get("vtype") != "Trailer"]),
        "trailers_total": len([v for v in vehicles if v.get("vtype") == "Trailer"]),
        "maintenance_due": len(maint_due),
        "timezone": "Africa/Johannesburg",
    }

# ---------------- Expenses ----------------
class ExpenseIn(BaseModel):
    description: str
    amount: float
    date: str = Field(default_factory=today_str)
    category: str = "General"
    payment_method: Optional[str] = "Cash"
    reference: Optional[str] = ""
    vehicle_id: Optional[str] = ""
    notes: Optional[str] = ""

def _check_expense(body):
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be greater than 0")
    if not body.description.strip():
        raise HTTPException(400, "Description is required")

@api.get("/expenses")
async def get_expenses(include_voided: bool = False, user=Depends(get_current_user)):
    flt = {} if include_voided else {"voided": {"$ne": True}}
    return await listall("expenses", flt, sort=("date", -1))

@api.post("/expenses")
async def add_expense(body: ExpenseIn, user=Depends(get_current_user)):
    _check_expense(body)
    d = body.model_dump()
    d["amount"] = r2(d["amount"])
    rec = await insert("expenses", d)
    await log_audit("expense", rec["id"], "created", user, after=rec)
    return rec

@api.put("/expenses/{eid}")
async def edit_expense(eid: str, body: ExpenseIn, user=Depends(get_current_user)):
    _check_expense(body)
    before = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Expense not found")
    if before.get("source_key"):
        raise HTTPException(400, "This expense is linked to a spare-part purchase. Edit it from Fleet > Spare Parts")
    d = body.model_dump()
    d["amount"] = r2(d["amount"])
    rec = await update_doc("expenses", eid, d)
    await log_audit("expense", eid, "updated", user, before=before, after=rec)
    return rec

@api.post("/expenses/{eid}/void")
async def void_expense(eid: str, body: ReasonIn, user=Depends(get_current_user)):
    if not body.reason.strip():
        raise HTTPException(400, "A reason is required")
    rec = await db.expenses.find_one_and_update({"id": eid, "voided": {"$ne": True}},
                                                {"$set": {"voided": True, "void_reason": body.reason, "voided_at": now_iso()}},
                                                projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not rec:
        raise HTTPException(400, "Expense not found or already voided")
    await log_audit("expense", eid, "voided", user, reason=body.reason)
    return rec

@api.delete("/expenses/{eid}")
async def del_expense(eid: str, user=Depends(get_current_user)):
    raise HTTPException(400, "Expenses are kept for history. Use Void with a reason instead")

def period_starts():
    t = local_today()
    week = (t - timedelta(days=t.weekday())).isoformat()
    month = t.replace(day=1).isoformat()
    return week, month

VEHICLE_COST_DONE = ("Done", "done")

async def cost_ledger(since=None, until=None):
    rows = []
    for x in await listall("expenses", {"voided": {"$ne": True}}):
        rows.append({"id": x["id"], "date": x.get("date"), "description": x.get("description"), "category": x.get("category", "General"),
                     "amount": x.get("amount", 0), "vehicle_id": x.get("vehicle_id", ""), "source": "spare_part" if x.get("source_key") else "expense"})
    vnames = {v["id"]: v["name"] for v in await listall("vehicles")}
    for x in await listall("vehicle_records"):
        if x.get("status") in VEHICLE_COST_DONE and (x.get("amount") or 0) > 0:
            rows.append({"id": x["id"], "date": x.get("date"), "description": f"{vnames.get(x.get('vehicle_id'), '')}: {x.get('description', '')}",
                         "category": f"Vehicle {x.get('type', 'expense').title()}", "amount": x.get("amount", 0),
                         "vehicle_id": x.get("vehicle_id"), "source": "fleet"})
    for r in rows:
        r["vehicle_name"] = vnames.get(r.get("vehicle_id"), "")
    return [r for r in rows if (not since or (r["date"] or "") >= since) and (not until or (r["date"] or "") <= until)]

async def profit_for(since, until=None):
    pays = [p for p in await listall("payments") if not p.get("reversed")]
    revenue = dsum(p.get("amount", 0) for p in pays if (p.get("date") or "") >= since and (not until or (p.get("date") or "") <= until))
    expense = dsum(x["amount"] for x in await cost_ledger(since, until))
    return {"revenue": revenue, "expenses": expense, "profit": r2(D(revenue) - D(expense)),
            "label": "Estimated cash result — incomplete cost data", "basis": "payment dates & expense dates"}

@api.get("/reports/profit")
async def profit_report(user=Depends(get_current_user)):
    week, month = period_starts()
    t = today_str()
    return {
        "today": await profit_for(t, t),
        "week": await profit_for(week),
        "month": await profit_for(month),
        "total_expenses": dsum(x["amount"] for x in await cost_ledger()),
        "week_start": week, "month_start": month, "timezone": "Africa/Johannesburg",
    }

@api.get("/reports/costs")
async def cost_report(since: Optional[str] = None, until: Optional[str] = None, user=Depends(get_current_user)):
    rows = sorted(await cost_ledger(since, until), key=lambda r: r["date"] or "", reverse=True)
    by_cat, by_veh = {}, {}
    for r in rows:
        by_cat[r["category"]] = r2(D(by_cat.get(r["category"], 0)) + D(r["amount"]))
        if r.get("vehicle_name"):
            by_veh[r["vehicle_name"]] = r2(D(by_veh.get(r["vehicle_name"], 0)) + D(r["amount"]))
    return {"rows": rows, "total": dsum(r["amount"] for r in rows), "by_category": by_cat, "by_vehicle": by_veh}

# ---------------- Vehicle records (expenses/repairs/maintenance) ----------------
VREC_STATUSES = ("Needed", "Scheduled", "In Progress", "Done", "Cancelled")

class VehicleRecordIn(BaseModel):
    type: str = "expense"  # expense, repair, maintenance
    description: str = ""
    amount: float = 0
    date: str = Field(default_factory=today_str)
    status: str = "Done"
    notes: Optional[str] = ""

@api.get("/vehicles/records/all")
async def all_vehicle_records(user=Depends(get_current_user)):
    return await listall("vehicle_records", sort=("date", -1))

@api.get("/vehicles/{vid}/records")
async def get_vehicle_records(vid: str, user=Depends(get_current_user)):
    return await listall("vehicle_records", {"vehicle_id": vid}, ("date", -1))

def _check_vrec(d):
    d["status"] = {"done": "Done", "needed": "Needed"}.get(d["status"], d["status"])
    if d["status"] not in VREC_STATUSES:
        raise HTTPException(400, f"Status must be one of {', '.join(VREC_STATUSES)}")
    if d["type"] not in ("expense", "repair", "maintenance"):
        raise HTTPException(400, "Type must be expense, repair or maintenance")
    if not d["description"].strip():
        raise HTTPException(400, "Description is required")
    if d["amount"] < 0:
        raise HTTPException(400, "Amount cannot be negative")
    d["amount"] = r2(d["amount"])
    return d

@api.post("/vehicles/{vid}/records")
async def add_vehicle_record(vid: str, body: VehicleRecordIn, user=Depends(get_current_user)):
    v = await db.vehicles.find_one({"id": vid})
    if not v:
        raise HTTPException(404, "Vehicle not found")
    d = _check_vrec(body.model_dump())
    d["vehicle_id"] = vid
    d["vehicle_name"] = v["name"]
    rec = await insert("vehicle_records", d)
    await log_audit("vehicle_record", rec["id"], "created", user, after=rec)
    return rec

@api.put("/vehicles/records/{rid}")
async def edit_vehicle_record(rid: str, body: VehicleRecordIn, user=Depends(get_current_user)):
    before = await db.vehicle_records.find_one({"id": rid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Record not found")
    rec = await update_doc("vehicle_records", rid, _check_vrec(body.model_dump()))
    await log_audit("vehicle_record", rid, "updated", user, before=before, after=rec)
    return rec

@api.delete("/vehicles/records/{rid}")
async def del_vehicle_record(rid: str, user=Depends(get_current_user)):
    before = await db.vehicle_records.find_one({"id": rid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Record not found")
    if before.get("status") in VEHICLE_COST_DONE and (before.get("amount") or 0) > 0:
        rec = await update_doc("vehicle_records", rid, {"status": "Cancelled"})
        await log_audit("vehicle_record", rid, "cancelled", user, before=before)
        return rec
    await db.vehicle_records.delete_one({"id": rid})
    await log_audit("vehicle_record", rid, "deleted", user, before=before)
    return {"ok": True}

# ---------------- Spare parts ----------------
PART_FLOW = {"to_buy": 0, "bought": 1, "installed": 2}

class SparePartIn(BaseModel):
    name: str
    quantity: float = 1
    expected_price: float = 0
    actual_cost: Optional[float] = None
    vehicle_id: Optional[str] = ""
    status: str = "to_buy"  # to_buy, bought, installed
    notes: Optional[str] = ""

async def sync_part_expense(part, user):
    key = f"sparepart:{part['id']}"
    if PART_FLOW.get(part["status"], 0) < 1:
        return
    cost = part.get("actual_cost")
    if cost is None or cost <= 0:
        raise HTTPException(400, "Enter the actual purchase cost (total) when marking a part as bought")
    existing = await db.expenses.find_one({"source_key": key})
    data = {"description": f"Spare part: {part['name']} x{part.get('quantity', 1):g}", "amount": r2(cost),
            "category": "Vehicle", "vehicle_id": part.get("vehicle_id", ""), "source_key": key,
            "date": part.get("bought_date") or today_str(), "payment_method": "", "reference": "", "notes": ""}
    if existing:
        if r2(existing.get("amount")) != r2(cost):
            await db.expenses.update_one({"source_key": key}, {"$set": {"amount": r2(cost), "updated_at": now_iso()}})
    else:
        try:
            await insert("expenses", data)
        except DuplicateKeyError:
            pass

@api.get("/spareparts")
async def get_spareparts(user=Depends(get_current_user)):
    parts = await listall("spareparts", sort=("created_at", -1))
    vehicles = {v["id"]: v["name"] for v in await listall("vehicles")}
    for p in parts:
        p["vehicle_name"] = vehicles.get(p.get("vehicle_id"), "")
    return parts

@api.post("/spareparts")
async def add_sparepart(body: SparePartIn, user=Depends(get_current_user)):
    d = body.model_dump()
    if d["status"] not in PART_FLOW:
        raise HTTPException(400, "Invalid status")
    if d["status"] != "to_buy":
        d["bought_date"] = today_str()
    d["id"] = new_id()
    await sync_part_expense(d, user)
    rec = await insert("spareparts", d)
    await log_audit("spare_part", rec["id"], "created", user, after=rec)
    return rec

@api.put("/spareparts/{pid}")
async def edit_sparepart(pid: str, body: SparePartIn, user=Depends(get_current_user)):
    before = await db.spareparts.find_one({"id": pid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Part not found")
    d = body.model_dump()
    if d["status"] not in PART_FLOW:
        raise HTTPException(400, "Invalid status")
    if PART_FLOW[d["status"]] < PART_FLOW.get(before.get("status"), 0):
        raise HTTPException(400, "A part cannot move back to an earlier status")
    d["bought_date"] = before.get("bought_date") or (today_str() if d["status"] != "to_buy" else None)
    d["id"] = pid
    await sync_part_expense(d, user)
    rec = await update_doc("spareparts", pid, d)
    await log_audit("spare_part", pid, "updated", user, before=before, after=rec)
    return rec

@api.delete("/spareparts/{pid}")
async def del_sparepart(pid: str, user=Depends(get_current_user)):
    p = await db.spareparts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Part not found")
    if p.get("status") != "to_buy":
        raise HTTPException(400, "Bought or installed parts are kept for history and cannot be deleted")
    await db.spareparts.delete_one({"id": pid})
    await log_audit("spare_part", pid, "deleted", user, before=p)
    return {"ok": True}

# ---------------- Customer import with opening balances ----------------
class ImportRow(BaseModel):
    name: str
    balance: float = 0

class ImportIn(BaseModel):
    rows: List[ImportRow]

@api.post("/customers/import")
async def import_customers(body: ImportIn, user=Depends(get_current_user)):
    seen, created, reused, ob_created, ob_skipped = {}, 0, 0, 0, 0
    today = local_today()
    for row in body.rows:
        name = row.name.strip()
        if not name:
            continue
        if row.balance < 0:
            raise HTTPException(400, f"Negative balance for {name} is not supported")
        k = seen.get(name, 0)
        seen[name] = k + 1
        same = await db.customers.find({"name": name}, {"_id": 0}).sort("created_at", 1).to_list(100)
        if len(same) > k:
            cust = same[k]
            reused += 1
        else:
            cust = {"id": new_id(), "name": name, "phone": "", "email": "", "address": "", "city": "", "notes": "",
                    "default_zone": 1, "payment_terms": "Due on Delivery", "active": True, "created_at": now_iso()}
            await db.customers.insert_one(dict(cust))
            created += 1
        amt = r2(row.balance)
        if amt <= 0:
            continue
        if await db.invoices.find_one({"customer_id": cust["id"], "opening_balance": True}):
            ob_skipped += 1
            continue
        inv = {"customer_id": cust["id"], "customer_name": name, "date": today.isoformat(),
               "due_date": (today + timedelta(days=30)).isoformat(), "zone": cust.get("default_zone", 1),
               "payment_terms": "Opening Balance", "reference": "Opening Balance", "destination": "", "order_ids": [],
               "notes": "Opening balance imported from previous records", "discount": 0, "extra_charges": 0,
               "tax_enabled": False, "tax_rate": 0, "amount_paid": 0, "opening_balance": True, "status": "issued",
               "items": [{"qty": 1, "category": "", "size": "", "description": "Opening Balance", "unit_price": amt,
                          "price_override": True, "tax": False, "order_id": ""}],
               "audit": [{"action": "opening_balance_imported", "at": now_iso(), "by": user["email"]}]}
        compute_invoice(inv)
        inv["number"] = await next_invoice_number()
        inv["issued_at"] = now_iso()
        rec = await insert("invoices", inv)
        await log_audit("invoice", rec["id"], "opening_balance_imported", user, after={"customer": name, "amount": amt})
        ob_created += 1
    return {"customers_created": created, "customers_reused": reused, "opening_balances_created": ob_created, "opening_balances_skipped": ob_skipped}

# ---------------- AI Business Assistant ----------------
ASSISTANT_MODEL = ("openai", "gpt-5.2")
SEARCH_MODEL = ("gemini", "gemini-3-flash-preview")

async def web_search(query):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    c = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=new_id(),
                system_message=f"Today is {today_str()} (Africa/Johannesburg). Search the web, answer factually and concisely, and list the source URLs you used.").with_model(*SEARCH_MODEL).with_tools([{"googleSearch": {}}])
    return await c.send_message(UserMessage(text=query))

WEB_TOOL = [{"type": "function", "function": {"name": "web_search", "description": "Search the live web for current/general information (fuel prices, news, weather, regulations, suppliers...). Returns an answer with source URLs.",
             "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}]

async def business_snapshot(user):
    dash = await dashboard(user)
    invs = await listall("invoices", sort=("date", -1))
    for i in invs:
        i["status"] = derive_status(i)
    open_inv = [{"number": i.get("number"), "customer": i.get("customer_name"), "date": i.get("date"), "due": i.get("due_date"),
                 "total": i.get("total"), "outstanding": i.get("outstanding"), "status": i["status"]}
                for i in invs if i["status"] in ("issued", "partially_paid", "overdue")]
    debtors = {}
    for i in open_inv:
        debtors[i["customer"]] = r2(D(debtors.get(i["customer"], 0)) + D(i["outstanding"]))
    week, month = period_starts()
    costs = await cost_ledger(month)
    orders = [{"ref": o.get("reference"), "customer": o.get("customer_name"), "destination": o.get("destination"), "products": o.get("products"),
               "priority": o.get("priority"), "status": o.get("status"), "ship_date": o.get("expected_ship_date")}
              for o in await listall("orders") if o.get("status") in OPEN_ORDER_STATUSES]
    vrecs = await listall("vehicle_records")
    drivers = {d["id"]: d["name"] for d in await listall("drivers")}
    return {
        "today": today_str(), "timezone": "Africa/Johannesburg", "currency": "ZAR",
        "totals": {k: dash[k] for k in ("total_invoiced", "payments_received", "outstanding", "overdue", "finished_stock")},
        "week": dash["week_profit"], "month": dash["month_profit"], "week_start": week, "month_start": month,
        "debtors_outstanding": dict(sorted(debtors.items(), key=lambda x: -x[1])),
        "open_invoices": open_inv[:60],
        "stock": [{"product": s["product"], "size": s["size"], "current": s["current"], "minimum": s.get("threshold")} for s in dash["current_stock"]],
        "low_stock": [{"product": s["product"], "size": s["size"], "current": s["current"], "minimum": s.get("threshold")} for s in dash["low_stock"]],
        "production": {"resting": len(dash["resting"]), "ready_for_cutting": [p.get("block_ref") for p in dash["ready_cutting"]]},
        "open_orders": orders[:40],
        "upcoming_deliveries": [{"ref": d.get("reference"), "customer": d.get("customer_name"), "destination": d.get("destination"),
                                 "status": d.get("status"), "driver": drivers.get(d.get("driver_id"), ""), "planned": d.get("planned_departure")} for d in dash["upcoming_deliveries"]],
        "attendance_today": dash["attendance_today"],
        "expenses_this_month": [{"date": c["date"], "description": c["description"], "category": c["category"], "amount": c["amount"]} for c in costs][:80],
        "fleet": [{"name": v["name"], "type": v.get("vtype"), "length": v.get("length"), "available": v.get("available"),
                   "pending_work": len([r for r in vrecs if r.get("vehicle_id") == v["id"] and r.get("status") in ("Needed", "Scheduled", "In Progress")])}
                  for v in await listall("vehicles")],
        "spare_parts_to_buy": [{"name": p["name"], "qty": p.get("quantity")} for p in await listall("spareparts", {"status": "to_buy"})],
    }

ASSISTANT_RULES = """You are the business assistant for SUPER IQ-FOAM, a foam mattress manufacturer and wholesaler in Kokstad, KwaZulu-Natal, South Africa.

STRICT OPERATING RULES
1) Answer only using the ERP business data provided below. Do not invent business facts, customer names, numbers, dates, prices, statuses, or stock levels.
2) If the answer is not in the ERP data, say exactly that. Do not guess. Suggest the page or record where the owner can verify it.
3) For non-business / general questions (weather, fuel prices, news, current market, regulations, suppliers, general advice, personal questions, unrelated topics), respond: "This is outside the ERP data. I can help with business questions only." You may use web search only for genuine current-events or general business info that is relevant to the factory/business. If you do use web search, you MUST end with a "Sources:" list of URLs.
4) Keep answers concise, practical and business-focused. Prefer short bullets, brief summary tables, and action-led responses.
5) Always use South African Rand formatting, e.g. R 1,234.56.
6) If discussing profit, explicitly say: "Estimated result = payments received minus recorded expenses; it is not accounting profit because not all costs are recorded."
7) You cannot create, edit, delete, or change data. You can only explain what exists and tell the user which ERP page to use for the action.
8) If the user asks for a number but the ERP does not contain it, say: "I don't have enough data in the ERP to confirm this." Do not answer from memory.
9) If the question is ambiguous, ask one short clarifying question instead of guessing.
10) The assistant should behave like a disciplined operations analyst for the business, not like a general chatbot.

RESPONSE FORMAT
- Start with the direct answer in 1 sentence.
- Then add a short bullet list with the relevant facts.
- If needed, finish with a "Next step:" suggestion pointing to the ERP page or record to check.
- If no answer exists in ERP, finish with: "I don't have enough data in the ERP to confirm this."

BUSINESS DATA:
"""

class AssistantIn(BaseModel):
    message: str
    session_id: Optional[str] = None

@api.get("/assistant/sessions")
async def assistant_sessions(user=Depends(get_current_user)):
    return await db.assistant_sessions.find({"user_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(100)

@api.get("/assistant/sessions/{sid}")
async def assistant_session(sid: str, user=Depends(get_current_user)):
    s = await db.assistant_sessions.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Conversation not found")
    s["messages"] = await db.assistant_messages.find({"session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return s

@api.delete("/assistant/sessions/{sid}")
async def assistant_delete(sid: str, user=Depends(get_current_user)):
    await db.assistant_sessions.delete_one({"id": sid, "user_id": user["id"]})
    await db.assistant_messages.delete_many({"session_id": sid})
    return {"ok": True}

@api.post("/assistant/chat")
async def assistant_chat(body: AssistantIn, user=Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone, ToolCallReady
    text = body.message.strip()
    if not text:
        raise HTTPException(400, "Message is empty")
    sid = body.session_id
    if sid and not await db.assistant_sessions.find_one({"id": sid, "user_id": user["id"]}):
        raise HTTPException(404, "Conversation not found")
    if not sid:
        sid = new_id()
        await db.assistant_sessions.insert_one({"id": sid, "user_id": user["id"], "title": text[:60], "created_at": now_iso(), "updated_at": now_iso()})
    history = await db.assistant_messages.find({"session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(40)
    snapshot = await business_snapshot(user)
    system = ASSISTANT_RULES + json.dumps(snapshot, default=str)
    initial = [{"role": "system", "content": system}] + [{"role": m["role"], "content": m["content"]} for m in history]
    await db.assistant_messages.insert_one({"id": new_id(), "session_id": sid, "role": "user", "content": text, "created_at": now_iso()})
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=sid, system_message=system, initial_messages=initial).with_model(*ASSISTANT_MODEL).with_tools(WEB_TOOL, tool_choice="auto")

    async def gen():
        yield f"data: {json.dumps({'type': 'session', 'session_id': sid})}\n\n"
        parts = []
        try:
            msg = UserMessage(text=text)
            for _ in range(4):
                pending = []
                async for ev in chat.stream_message(msg):
                    if isinstance(ev, TextDelta):
                        parts.append(ev.content)
                        yield f"data: {json.dumps({'type': 'delta', 'content': ev.content})}\n\n"
                    elif isinstance(ev, ToolCallReady):
                        pending.append(ev.tool_call)
                    elif isinstance(ev, StreamDone):
                        break
                if not pending:
                    break
                for tc in pending:
                    q = (tc.arguments or {}).get("query", "")
                    yield f"data: {json.dumps({'type': 'status', 'content': 'Searching the web: ' + q})}\n\n"
                    try:
                        res = await web_search(q)
                    except Exception as e:
                        res = f"Web search failed: {str(e)[:120]}"
                    chat.add_tool_result(tc.id, json.dumps({"result": res}))
                msg = None
        except Exception as e:
            logging.exception("assistant error")
            yield f"data: {json.dumps({'type': 'error', 'message': 'The AI assistant is unavailable right now. ' + str(e)[:160]})}\n\n"
        answer = "".join(parts)
        if answer:
            await db.assistant_messages.insert_one({"id": new_id(), "session_id": sid, "role": "assistant", "content": answer, "created_at": now_iso()})
        await db.assistant_sessions.update_one({"id": sid}, {"$set": {"updated_at": now_iso()}})
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ---------------- Audit ----------------
@api.get("/audit")
async def get_audit(entity: Optional[str] = None, entity_id: Optional[str] = None, user=Depends(get_current_user)):
    flt = {k: v for k, v in {"entity": entity, "entity_id": entity_id}.items() if v}
    return await db.audit_log.find(flt, {"_id": 0}).sort("at", -1).to_list(500)

# ---------------- Orders to send ----------------
class OrderIn(BaseModel):
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    destination: str = ""
    products: str = ""
    items: List[dict] = []  # [{qty, category, size}]
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
    d["reference"] = await next_ref("ord", "ORD")
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
# ---------------- Simple daily production (white / blue blocks) ----------------
class DailyProdIn(BaseModel):
    date: str = Field(default_factory=today_str)
    white_blocks: int = 0
    blue_blocks: int = 0
    notes: Optional[str] = ""

@api.get("/production/daily")
async def get_daily_prod(user=Depends(get_current_user)):
    rows = await listall("production_daily", sort=("date", -1))
    week, month = period_starts()
    tot = lambda since: {c: sum(r.get(c, 0) for r in rows if r["date"] >= since) for c in ("white_blocks", "blue_blocks")}
    return {"rows": rows, "today": tot(today_str()), "week": tot(week), "month": tot(month)}

@api.post("/production/daily")
async def save_daily_prod(body: DailyProdIn, user=Depends(get_current_user)):
    if body.white_blocks < 0 or body.blue_blocks < 0:
        raise HTTPException(400, "Block counts cannot be negative")
    d = body.model_dump()
    ex = await db.production_daily.find_one({"date": d["date"]}, {"_id": 0})
    rec = await update_doc("production_daily", ex["id"], d) if ex else await insert("production_daily", d)
    await log_audit("production_daily", rec["id"], "saved", user, before=ex, after=rec)
    return rec

@api.delete("/production/daily/{pid}")
async def del_daily_prod(pid: str, user=Depends(get_current_user)):
    await db.production_daily.delete_one({"id": pid})
    await log_audit("production_daily", pid, "deleted", user)
    return {"ok": True}

class BulkAttendanceIn(BaseModel):
    date: str
    status: str = "Present"
    employee_ids: List[str]

@api.post("/attendance/bulk")
async def bulk_attendance(body: BulkAttendanceIn, user=Depends(get_current_user)):
    for eid in body.employee_ids:
        await add_attendance(AttendanceIn(employee_id=eid, date=body.date, status=body.status), user)
    return {"ok": True, "count": len(body.employee_ids)}

# ---------------- Trip planner ----------------
class TripPlanIn(BaseModel):
    invoice_numbers: List[str]
    vehicle_id: Optional[str] = ""
    trailer_id: Optional[str] = ""
    fuel_in_tank_l: float = 0
    departure: Optional[str] = None
    cities: dict = {}  # invoice_number -> city override

def _guess_city(text, table):
    t = (text or "").upper()
    hits = [c for c in table if c and c in t]
    return max(hits, key=len) if hits else ""

@api.post("/deliveries/plan")
async def plan_trip(body: TripPlanIn, user=Depends(get_current_user)):
    st = await get_settings(user)
    table = {k.upper(): v for k, v in (st.get("city_distances") or {}).items()}
    weights = st.get("piece_weights_kg") or {}
    stops, missing, warnings = [], [], []
    for raw in body.invoice_numbers:
        num = raw.strip().upper()
        if not num:
            continue
        inv = await db.invoices.find_one({"number": {"$regex": f"^{num}$", "$options": "i"}}, {"_id": 0})
        if not inv:
            missing.append(f"Invoice {num} not found")
            continue
        cust = await db.customers.find_one({"id": inv["customer_id"]}, {"_id": 0}) or {}
        city = (body.cities.get(inv["number"]) or inv.get("destination") or cust.get("city") or "").strip()
        guessed = False
        if not city:
            city, guessed = _guess_city(cust.get("name", ""), table), True
        dist = table.get(city.upper()) if city else None
        pieces = sum(int(it.get("qty") or 0) for it in inv.get("items", []) if it.get("size"))
        kg = 0
        unknown_w = False
        for it in inv.get("items", []):
            if it.get("size"):
                w = weights.get(it["size"])
                if w is None:
                    unknown_w = True
                else:
                    kg += float(w) * int(it.get("qty") or 0)
        stops.append({"invoice": inv["number"], "customer": inv.get("customer_name"), "city": city, "city_guessed": guessed and bool(city),
                      "distance_km": dist, "pieces": pieces, "weight_kg": None if unknown_w else round(kg),
                      "items": [{"qty": it.get("qty"), "category": it.get("category"), "size": it.get("size"), "description": it.get("description")} for it in inv.get("items", [])]})
        if not city:
            missing.append(f"{inv['number']} ({inv.get('customer_name')}): city unknown — enter it")
        elif dist is None:
            missing.append(f"{city}: distance from Kokstad not configured — add it in Settings")
    stops.sort(key=lambda s: s["distance_km"] if s["distance_km"] is not None else 9999)
    total_pieces = sum(s["pieces"] for s in stops)
    weight_known = all(s["weight_kg"] is not None for s in stops) and stops
    total_kg = sum(s["weight_kg"] or 0 for s in stops) if weight_known else None
    if not weight_known:
        warnings.append("Weight per mattress size not configured (Settings > piece weights) — truck choice is based on pieces/distance only")
    far = max([s["distance_km"] for s in stops if s["distance_km"] is not None], default=None)
    route_km = round(far * 2 * 1.1) if far is not None else None  # out-and-back along route + 10% detours (estimate)
    vehicles = await listall("vehicles")
    trucks = [v for v in vehicles if v.get("vtype") != "Trailer" and v.get("available") and v.get("consumption_max")]
    trailers = [v for v in vehicles if v.get("vtype") == "Trailer" and v.get("available")]
    trucks.sort(key=lambda v: v.get("payload_kg") or 0)
    sel = next((v for v in trucks if v["id"] == body.vehicle_id), None)
    if not sel and trucks:
        if total_kg is not None:
            sel = next((v for v in trucks if (v.get("payload_kg") or 0) >= total_kg), None)
            if not sel:
                sel = trucks[-1]
                warnings.append(f"Load {total_kg} kg exceeds largest truck payload — split the trip or add a trailer")
        else:
            sel = trucks[-1] if (total_pieces > 150 or (far or 0) > 150) else trucks[0]
    trailer = next((v for v in trailers if v["id"] == body.trailer_id), None)
    if not trailer and sel and total_kg is not None and total_kg > (sel.get("payload_kg") or 0) and trailers:
        trailer = sorted(trailers, key=lambda v: float((v.get("length") or "0").split()[0] or 0))[-1]
        warnings.append("Trailer suggested because load exceeds truck payload — confirm the truck can tow it")
    fuel = None
    if sel and route_km is not None:
        load_factor = (total_kg / sel["payload_kg"]) if (total_kg and sel.get("payload_kg")) else 0.5
        cons = sel["consumption_min"] + (sel["consumption_max"] - sel["consumption_min"]) * min(max(load_factor, 0), 1)
        if trailer:
            cons *= 1.15
        need = round(route_km * cons / 100 * 1.1, 1)  # +10% reserve
        to_buy = max(round(need - (body.fuel_in_tank_l or 0), 1), 0)
        price = st.get("diesel_price") if diesel_price_is_current(st.get("diesel_price_date")) else None
        fuel = {"consumption_l_100km": round(cons, 1), "needed_l": need, "in_tank_l": body.fuel_in_tank_l, "to_give_l": to_buy,
                "price_per_l": price, "price_date": st.get("diesel_price_date"), "cost": round(to_buy * price, 2) if price else None}
        if not price:
            warnings.append("Current diesel price unavailable or outdated — check today's price before relying on the fuel cost")
    timing = None
    if route_km is not None:
        drive_h = route_km / float(st.get("avg_speed_kmh") or 60)
        stops_h = len(stops) * float(st.get("offload_minutes_per_stop") or 45) / 60
        dep = parse_dt(body.departure) if body.departure else local_now().replace(hour=8, minute=0, second=0, microsecond=0)
        ret = dep + timedelta(hours=drive_h + stops_h + 0.5)
        timing = {"drive_hours": round(drive_h, 1), "offload_hours": round(stops_h, 1), "departure": dep.isoformat(), "return_eta": ret.isoformat()}
        if ret.hour >= 17 or ret.date() > dep.date():
            warnings.append("Estimated return is after 17:00 — consider leaving earlier or splitting the trip")
    return {"stops": stops, "missing": missing, "warnings": warnings, "total_pieces": total_pieces, "total_kg": total_kg,
            "route_km": route_km, "vehicle": sel, "trailer": trailer, "fuel": fuel, "timing": timing,
            "note": "Distances, consumption and times are ESTIMATES based on configured values"}

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
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({"id": new_id(), "email": admin_email,
                                   "password_hash": hash_pw(admin_pw), "name": "Admin",
                                   "role": "admin", "created_at": now_iso()})

    for n in seed_data.CUSTOMERS:
        if not await db.customers.find_one({"name": n}):
            await db.customers.insert_one({"id": new_id(), "name": n, "phone": "", "email": "",
                                           "address": "", "city": "", "notes": "", "default_zone": 1,
                                           "payment_terms": "Due on Delivery", "active": True,
                                           "created_at": now_iso()})
    for p in seed_data.PRICES:
        if not await db.prices.find_one({"zone": p["zone"], "category": p["category"], "size": p["size"]}):
            await db.prices.insert_one({"id": new_id(), **p, "updated_at": now_iso(), "created_at": now_iso()})
    for s in seed_data.STOCK:
        if not await db.stock.find_one({"product": s["product"], "size": s["size"]}):
            await db.stock.insert_one({"id": new_id(), **s, "created_at": now_iso()})
    for d in seed_data.DRIVERS:
        if not await db.drivers.find_one({"name": d["name"]}):
            await db.drivers.insert_one({"id": new_id(), **d, "created_at": now_iso()})

    # fleet migration: rename first trailer, retire placeholder vehicles without history
    await db.vehicles.update_one({"name": "Trailer", "length": "9 m"}, {"$set": {"name": "Trailer (1)"}})
    for name in seed_data.RETIRED_PLACEHOLDERS:
        v = await db.vehicles.find_one({"name": name})
        if v:
            used = sum([await db[c].count_documents({"vehicle_id": v["id"]}) for c in ("vehicle_records", "spareparts", "orders", "deliveries", "expenses")])
            if used == 0:
                await db.vehicles.delete_one({"id": v["id"]})
    for v in seed_data.FLEET:
        if not await db.vehicles.find_one({"name": v["name"]}):
            await db.vehicles.insert_one({"id": new_id(), **v, "created_at": now_iso()})

    if await db.settings.count_documents({}) == 0:
        await db.settings.insert_one({**seed_data.DEFAULT_SETTINGS, "created_at": now_iso()})
    await db.vehicle_records.update_many({"status": "done"}, {"$set": {"status": "Done"}})
    # split generic Ribbon into Ribbon Black / Ribbon Pink
    if await db.prices.count_documents({"category": {"$in": ["Ribbon", "Ribbon Black & Pink"]}}):
        await db.prices.delete_many({"category": {"$in": ["Ribbon", "Ribbon Black & Pink"]}})
        for p in seed_data.PRICES:
            if p["category"] in ("Ribbon Black", "Ribbon Pink") and not await db.prices.find_one({"zone": p["zone"], "category": p["category"], "size": p["size"]}):
                await db.prices.insert_one({"id": new_id(), **p, "updated_at": now_iso(), "created_at": now_iso()})
        await db.stock.update_many({"product": "Ribbon"}, {"$set": {"product": "Ribbon Pink"}})
        await db.stock.update_many({"product": "Black"}, {"$set": {"product": "Ribbon Black"}})
        await db.settings.update_one({"id": "singleton"}, {"$set": {"product_categories": seed_data.DEFAULT_SETTINGS["product_categories"]}})
    for v in seed_data.FLEET:
        if v.get("payload_kg"):
            await db.vehicles.update_one({"name": v["name"], "consumption_max": {"$exists": False}},
                                         {"$set": {k: v[k] for k in ("model", "consumption_min", "consumption_max", "payload_kg", "capacity")}})
    await db.vehicle_records.update_many({"status": "needed"}, {"$set": {"status": "Needed"}})
    year = local_today().year
    for key, coll in (("del", "deliveries"), ("ord", "orders")):
        if not await db.counters.find_one({"id": f"{key}-{year}"}):
            await db.counters.insert_one({"id": f"{key}-{year}", "seq": await db[coll].count_documents({})})

    for coll, keys, kw in (("payments", "idempotency_key", {"unique": True, "sparse": True}),
                           ("stock_movements", "dedupe_key", {"unique": True, "sparse": True}),
                           ("expenses", "source_key", {"unique": True, "sparse": True}),
                           ("attendance", [("employee_id", 1), ("date", 1)], {"unique": True}),
                           ("prices", [("zone", 1), ("category", 1), ("size", 1)], {"unique": True}),
                           ("audit_log", [("entity", 1), ("entity_id", 1)], {})):
        try:
            await db[coll].create_index(keys, **kw)
        except Exception as e:
            logging.warning(f"Index on {coll} not created: {e}")

async def initialize_multi_company():
    for profile in COMPANY_PROFILES:
        await base_db.companies.update_one(
            {"id": profile["id"]},
            {"$setOnInsert": {**profile, "active": True, "created_at": now_iso()}},
            upsert=True,
        )

    owner_email = canonical_email(os.environ["ADMIN_EMAIL"])
    owner = await base_db.users.find_one({"email": owner_email}, {"_id": 0})
    if not owner:
        raise RuntimeError("Configured ADMIN_EMAIL account is missing; refusing multi-company migration")
    await base_db.users.update_one({"id": owner["id"]}, {"$set": {
        "role": "owner", "username": "SUPERIQFOAM", "company_roles": {},
        "company_ids": [profile["id"] for profile in COMPANY_PROFILES], "active": True,
    }})

    users = await base_db.users.find({"id": {"$ne": owner["id"]}}, {"_id": 0}).to_list(5000)
    for account in users:
        roles = account.get("company_roles") or {
            DEFAULT_COMPANY_ID: "admin" if account.get("role") == "admin" else "user"
        }
        await base_db.users.update_one({"id": account["id"]}, {"$set": {
            "role": "user", "company_roles": roles,
            "company_ids": list(dict.fromkeys([*account.get("company_ids", []), *roles.keys()])),
            "active": account.get("active", True),
        }})

    for profile in COMPANY_PROFILES:
        company_id = profile["id"]
        count = await base_db.users.count_documents({
            f"company_roles.{company_id}": "admin", "active": {"$ne": False},
        })
        await base_db.company_admin_counts.replace_one(
            {"_id": company_id}, {"_id": company_id, "count": count}, upsert=True,
        )

    for collection_name in await base_db.list_collection_names():
        if collection_name in GLOBAL_COLLECTIONS:
            continue
        await base_db[collection_name].update_many(
            {"company_id": {"$exists": False}},
            {"$set": {"company_id": DEFAULT_COMPANY_ID}},
        )
        await base_db[collection_name].create_index("company_id")

    for company_id in ("iqfoam-manufactoring", "iqfoam-whole-sallers"):
        await initialize_empty_company(company_id)

    await base_db.users.create_index("username", unique=True, sparse=True)
    await base_db.companies.create_index("id", unique=True)
    await initialize_company_profile_users()

async def initialize_company_profile_users():
    profiles = [
        ("iqfoam-manufactoring", "IQFOAM MANUFACTORING", "manufactoring@profiles.invalid", "INITIAL_MANUFACTURING_PASSWORD"),
        ("iqfoam-whole-sallers", "IQFOAM WHOLE SALLERS", "wholesallers@profiles.invalid", "INITIAL_WHOLESALER_PASSWORD"),
    ]
    for company_id, username, email, env_name in profiles:
        if await base_db.users.find_one({"username": username}):
            continue
        initial_password = os.environ.get(env_name)
        if not initial_password:
            logging.warning("Initial profile %s is waiting for a secure server-side password configuration", username)
            continue
        await base_db.users.insert_one({"id": new_id(), "username": username, "email": email,
            "name": username, "password_hash": hash_pw(initial_password), "role": "user",
            "company_roles": {company_id: "user"}, "company_ids": [company_id], "active": True,
            "auth_provider": "password", "created_at": now_iso()})

async def initialize_empty_company(company_id):
    company_db = tenant_database(client, base_db, company_id)
    invoice_details = COMPANY_INVOICE_DETAILS.get(company_id, {})
    if await company_db.settings.count_documents({}) == 0:
        await company_db.settings.insert_one({**seed_data.DEFAULT_SETTINGS, **invoice_details, "id": "singleton",
                                              "company_id": company_id, "created_at": now_iso()})
    elif invoice_details:
        await company_db.settings.update_one(
            {"id": "singleton", "company_name": seed_data.DEFAULT_SETTINGS["company_name"],
             "address": "", "telephone": ""},
            {"$set": invoice_details},
        )
    if uses_unified_price_list(company_id):
        settings = await company_db.settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
        if settings.get("unified_price_list_version") != 2:
            await company_db.prices.delete_many({})
            for price in seed_data.IQFOAM_UNIFIED_PRICES:
                await company_db.prices.insert_one({
                    "id": new_id(), "zone": 1, **price, "active": True,
                    "confirmed": price["price"] is not None, "company_id": company_id,
                    "created_at": now_iso(), "updated_at": now_iso(),
                })
            await company_db.customers.update_many({}, {"$set": {"default_zone": 1}})
            await company_db.settings.update_one(
                {"id": "singleton"}, {"$set": {"unified_price_list_version": 2}}
            )

        existing_stock = await company_db.stock.find({}, {"_id": 0, "product": 1, "size": 1}).to_list(5000)
        stock_keys = {
            (str(item.get("product", "")).strip().casefold(), str(item.get("size", "")).strip().casefold())
            for item in existing_stock
        }
        for item in seed_data.STOCK:
            key = (item["product"].strip().casefold(), item["size"].strip().casefold())
            if key in stock_keys:
                continue
            await company_db.stock.insert_one({
                "id": new_id(), "product": item["product"], "size": item["size"],
                "opening": 0, "threshold": item.get("threshold", 0),
                "company_id": company_id, "created_at": now_iso(),
            })
            stock_keys.add(key)
    else:
        for price in seed_data.PRICES:
            key = {k: price[k] for k in ("zone", "category", "size")}
            if not await company_db.prices.find_one(key):
                await company_db.prices.insert_one({"id": new_id(), **price, "company_id": company_id,
                                                    "created_at": now_iso(), "updated_at": now_iso()})
    for coll, keys, options in (("payments", "idempotency_key", {"unique": True, "sparse": True}),
                                ("stock_movements", "dedupe_key", {"unique": True, "sparse": True}),
                                ("expenses", "source_key", {"unique": True, "sparse": True}),
                                ("attendance", [("employee_id", 1), ("date", 1)], {"unique": True}),
                                ("prices", [("zone", 1), ("category", 1), ("size", 1)], {"unique": True}),
                                ("audit_log", [("entity", 1), ("entity_id", 1)], {})):
        await company_db[coll].create_index(keys, **options)

@app.on_event("startup")
async def on_startup():
    await seed()
    await initialize_multi_company()

app.include_router(api)
configured_cors_origins = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "*").split(",") if origin.strip()]
if "*" in configured_cors_origins:
    configured_cors_origins = ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]
    cors_origin_regex = r"https://[a-zA-Z0-9-]+\.preview\.emergentagent\.com"
else:
    cors_origin_regex = None
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=configured_cors_origins, allow_origin_regex=cors_origin_regex,
                   allow_methods=["*"], allow_headers=["*"])

@app.middleware("http")
async def reset_company_scope(request: Request, call_next):
    token = active_company_id.set(None)
    try:
        return await call_next(request)
    finally:
        active_company_id.reset(token)
logging.basicConfig(level=logging.INFO)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
