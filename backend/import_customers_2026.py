"""Import real customer list + opening balances via the API (idempotent). Usage: python import_customers_2026.py [--dry]"""
import html, json, os, re, sys, urllib.request

SRC = "/app/backend/data/customers_opening_2026.txt"

def parse():
    txt = open(SRC, encoding="utf-8").read()
    rows = []
    for m in re.finditer(r"\s*(.+?)\s*€\s*([\d.]+,\d{2})", txt):
        name = html.unescape(m.group(1)).strip()
        amount = float(m.group(2).replace(".", "").replace(",", "."))
        rows.append({"name": name, "balance": amount})
    return rows

def call(api, path, body=None, token=None):
    req = urllib.request.Request(api + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
                                 method="POST" if body is not None else "GET")
    return json.load(urllib.request.urlopen(req, timeout=120))

if __name__ == "__main__":
    rows = parse()
    pos = [r for r in rows if r["balance"] > 0]
    print(f"parsed {len(rows)} rows, {len(pos)} with balance, total R {sum(r['balance'] for r in pos):,.2f}")
    if "--dry" in sys.argv:
        sys.exit()
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    api = "http://localhost:8001/api"
    tok = call(api, "/auth/login", {"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]})["token"]
    print(call(api, "/customers/import", {"rows": rows}, tok))
