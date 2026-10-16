# Iteration 2: real customer import, opening balances, dashboard/summary, OB payment+reverse, assistant multi-turn with real data
import os, sys, json, uuid
from collections import Counter
import pytest, requests

sys.path.insert(0, "/app/backend")
from import_customers_2026 import parse  # noqa

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "2j2skp87z8@privaterelay.appleid.com"
ADMIN_PW = "iqfoam2026"


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def customers(H):
    return requests.get(f"{API}/customers", headers=H).json()


@pytest.fixture(scope="module")
def ob_invoices(H):
    return [i for i in requests.get(f"{API}/invoices", headers=H).json() if i.get("opening_balance")]


# ---- Customer import ----
class TestCustomerImport:
    def test_parse_source(self):
        rows = parse()
        assert len(rows) == 266
        pos = [r for r in rows if r["balance"] > 0]
        assert len(pos) == 26 and round(sum(r["balance"] for r in pos), 2) == 905471.00

    def test_all_names_exist_with_dup_counts(self, customers):
        need = Counter(r["name"] for r in parse())
        have = Counter(c["name"] for c in customers)
        missing = {n: k for n, k in need.items() if have.get(n, 0) < k}
        assert not missing, missing
        assert have["FATIMA ADAM BIZANA"] >= 2
        assert "MR FURNITURE & APPLIANCES" in have

    def test_import_idempotent(self, H, customers):
        n_before = len(customers)
        rows = [{"name": "LING UMTHATHA", "balance": 400965.0}, {"name": "AB WAKA WAKA", "balance": 41940.0}]
        r = requests.post(f"{API}/customers/import", headers=H, json={"rows": rows})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["customers_created"] == 0 and d["customers_reused"] == 2
        assert d["opening_balances_created"] == 0 and d["opening_balances_skipped"] == 2
        assert len(requests.get(f"{API}/customers", headers=H).json()) == n_before

    def test_import_negative_rejected(self, H):
        r = requests.post(f"{API}/customers/import", headers=H, json={"rows": [{"name": "TEST_neg", "balance": -5}]})
        assert r.status_code == 400

    def test_import_requires_auth(self):
        assert requests.post(f"{API}/customers/import", json={"rows": []}).status_code == 401


# ---- Opening balances ----
class TestOpeningBalances:
    def test_count_and_sum(self, ob_invoices):
        assert len(ob_invoices) == 26
        assert round(sum(i["outstanding"] for i in ob_invoices), 2) == 905471.00
        for i in ob_invoices:
            assert i["number"] and i["status"] in ("issued", "overdue")
            assert i["payment_terms"] == "Opening Balance"

    def test_dashboard(self, H, ob_invoices):
        d = requests.get(f"{API}/dashboard", headers=H).json()
        invs = requests.get(f"{API}/invoices", headers=H).json()
        valid = [i for i in invs if i.get("status") not in ("void", "draft")]
        exp_total = round(sum(i["total"] for i in valid if not i.get("opening_balance")), 2)
        exp_out = round(sum(i["outstanding"] for i in valid), 2)
        assert round(d["total_invoiced"], 2) == exp_total
        assert round(d["outstanding"], 2) == exp_out
        assert d["outstanding"] >= 905471.00

    def test_ling_summary(self, H, customers):
        ling = [c for c in customers if c["name"] == "LING UMTHATHA"]
        assert len(ling) == 1
        s = requests.get(f"{API}/customers/{ling[0]['id']}/summary", headers=H).json()
        assert s["outstanding"] == 400965.0 and s["opening_balance"] == 400965.0 and s["total_invoiced"] == 0
        assert len(s["invoices"]) == 1 and s["invoices"][0]["opening_balance"] is True


# ---- Partial payment on OB invoice, then reverse ----
class TestOBPayment:
    def test_pay_and_reverse(self, H, customers):
        cust = [c for c in customers if c["name"] == "WELCOME STORE"][0]
        s0 = requests.get(f"{API}/customers/{cust['id']}/summary", headers=H).json()
        inv = [i for i in s0["invoices"] if i.get("opening_balance")][0]
        key = f"TEST_ob_{uuid.uuid4().hex}"
        r = requests.post(f"{API}/invoices/{inv['id']}/payments", headers=H,
                          json={"amount": 100, "method": "Cash", "date": inv["date"], "idempotency_key": key, "notes": "TEST_ob payment"})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        try:
            r2 = requests.post(f"{API}/invoices/{inv['id']}/payments", headers=H,
                               json={"amount": 100, "method": "Cash", "date": inv["date"], "idempotency_key": key})
            assert r2.json()["id"] == pid
            s1 = requests.get(f"{API}/customers/{cust['id']}/summary", headers=H).json()
            assert round(s0["outstanding"] - s1["outstanding"], 2) == 100
            assert round(s0["opening_balance"] - s1["opening_balance"], 2) == 100
            i1 = requests.get(f"{API}/invoices/{inv['id']}", headers=H).json()
            assert i1["status"] == "partially_paid"
        finally:
            rv = requests.post(f"{API}/payments/{pid}/reverse", headers=H, json={"reason": "TEST cleanup"})
            assert rv.status_code == 200, rv.text
        s2 = requests.get(f"{API}/customers/{cust['id']}/summary", headers=H).json()
        assert s2["outstanding"] == s0["outstanding"]


def sse(H, payload):
    r = requests.post(f"{API}/assistant/chat", headers=H, json=payload, stream=True, timeout=180)
    assert r.status_code == 200, r.text
    ev = [json.loads(l[6:]) for l in r.iter_lines(decode_unicode=True) if l and l.startswith("data: ")]
    return ev, "".join(e["content"] for e in ev if e["type"] == "delta")


# ---- Assistant multi-turn with real data (2 LLM calls) ----
class TestAssistantRealData:
    def test_multi_turn(self, H):
        ev, a1 = sse(H, {"message": "What is the largest outstanding customer? Name only."})
        print("A1:", a1)
        sid = ev[0]["session_id"]
        try:
            assert ev[0]["type"] == "session" and ev[-1]["type"] == "done"
            assert not [e for e in ev if e["type"] == "error"]
            assert "LING UMTHATHA" in a1.upper()
            ev2, a2 = sse(H, {"message": "How much do they owe?", "session_id": sid})
            print("A2:", a2)
            assert ev2[0]["session_id"] == sid
            assert "400,965" in a2 or "400 965" in a2 or "400965" in a2
            ls = requests.get(f"{API}/assistant/sessions", headers=H).json()
            assert any(s["id"] == sid for s in ls)
            d = requests.get(f"{API}/assistant/sessions/{sid}", headers=H).json()
            assert [m["role"] for m in d["messages"]] == ["user", "assistant", "user", "assistant"]
        finally:
            assert requests.delete(f"{API}/assistant/sessions/{sid}", headers=H).status_code == 200
        assert requests.get(f"{API}/assistant/sessions/{sid}", headers=H).status_code == 404
