"""Seed data constants for SUPER IQ-FOAM ERP."""

CUSTOMERS = [
    "AB WAKA WAKA", "ABBAS QUMBO", "ABC TSOLO", "ABDUL LUSIKISIKI",
    "AD BANTU BONKE", "ADDIS HARDING", "ADIL UMZ", "AHMAD YAR",
    "AKBAR JABULA BLANKETS", "AL HASSAN",
]

# zone, category, {size: price or None}
PRICES = []

def _add(zone, category, items):
    for size, price in items.items():
        PRICES.append({"zone": zone, "category": category, "size": size,
                       "price": price, "active": True,
                       "confirmed": price is not None})

# ---------------- ZONE 1 ----------------
_add(1, "Standard", {
    "760x50": 85.00, "760x75": 130.00, "760x100": 160.00, "760x120": 198.00, "760x150": 232.00,
    "910x50": 105.00, "910x75": 145.00, "910x100": 171.00, "910x120": 205.00, "910x150": 255.00,
    "1070x50": 116.50, "1070x75": 175.00, "1070x100": 203.00, "1070x120": 250.00, "1070x150": 292.00,
    "1370x50": 165.00, "1370x75": 200.00, "1370x100": 260.00, "1370x120": 310.00, "1370x150": 387.50,
})
_add(1, "Ribbon", {
    "760x100": 198.00,
    "910x100": 215.00, "910x120": 258.00, "910x150": 322.00,
    "1070x100": 255.00, "1070x120": 285.00,
    "1370x120": 335.00,
    "1370x150": None,  # ALWAYS manual price + admin confirmation
})
_add(1, "Strong Boy", {
    "760x125": 285.00, "910x125": 375.00, "1070x125": 410.00, "1370x125": 550.00,
})
_add(1, "Uncovered", {
    "910x100": 195.00, "1070x100": 233.00,
})

# ---------------- ZONE 2 ----------------
_add(2, "Standard", {
    "760x50": 95.00, "760x75": 130.00, "760x100": 170.00, "760x120": 208.00, "760x150": 235.00,
    "910x50": 115.00, "910x75": 155.00, "910x100": 181.00, "910x120": 228.00, "910x150": 285.00,
    "1070x50": 123.00, "1070x75": 185.00, "1070x100": 215.00, "1070x120": 255.00, "1070x150": 300.00,
    "1370x50": 175.00, "1370x75": 210.00, "1370x100": 265.00, "1370x120": 325.00, "1370x150": 407.00,
})
_add(2, "Ribbon Black & Pink", {
    "760x100": 200.00, "760x120": 240.00, "760x150": 300.00,
    "910x100": 225.00, "910x120": 258.00, "910x150": 338.00,
    "1070x100": 265.00, "1070x120": 295.00,
    "1370x100": 310.00, "1370x120": 372.00,
    "1370x150": None,  # UNCONFIRMED - requires admin configuration
})
_add(2, "Strong Boy", {
    "760x125": 320.00, "910x125": 385.00, "1070x125": 410.00, "1370x125": 525.00,
})
_add(2, "Uncovered Blue 16 Density", {
    "910x100": 240.00, "1070x100": 290.00,
})

STOCK = [
    {"product": "Ribbon Black", "size": "910x100", "opening": 15, "threshold": 5},
    {"product": "Simple", "size": "1070x100", "opening": 65, "threshold": 10},
    {"product": "Pink Ribbon", "size": "910x100", "opening": 20, "threshold": 5},
    {"product": "Candy", "size": "760x100", "opening": 30, "threshold": 8},
]

DRIVERS = [
    {"name": "Abdul", "preferences": "Prefers larger, long-distance deliveries. Normal hours ~08:00-17:00. Do not auto-calculate overtime.", "size_pref": "large", "active": True},
    {"name": "Tkoso", "preferences": "Prefers small & medium deliveries; can handle larger when needed. Prefer normal hours.", "size_pref": "small", "active": True},
    {"name": "Ayanda", "preferences": "Prefers small & medium deliveries; can handle larger when needed. Prefer normal hours.", "size_pref": "small", "active": True},
]

TRAILERS = [
    {"name": "Trailer", "registration": "", "vtype": "Trailer", "capacity": "", "length": "9 m", "available": True, "notes": "Largest trailer"},
    {"name": "Trailer (2)", "registration": "", "vtype": "Trailer", "capacity": "", "length": "5 m", "available": True, "notes": ""},
    {"name": "Trailer (3)", "registration": "", "vtype": "Trailer", "capacity": "", "length": "4 m", "available": True, "notes": ""},
]

FLEET = [
    {"name": "Mighty Hyundai Truck", "registration": "", "vtype": "Medium Truck", "capacity": "", "length": "", "available": True, "notes": ""},
    {"name": "Hino 500", "registration": "", "vtype": "Large Truck", "capacity": "", "length": "", "available": True, "notes": "Largest truck"},
    {"name": "Hino 300", "registration": "", "vtype": "Medium Truck", "capacity": "", "length": "", "available": True, "notes": ""},
    {"name": "Trailer (1)", "registration": "", "vtype": "Trailer", "capacity": "", "length": "9 m", "available": True, "notes": "Largest trailer"},
    {"name": "Trailer (2)", "registration": "", "vtype": "Trailer", "capacity": "", "length": "5 m", "available": True, "notes": ""},
    {"name": "Trailer (3)", "registration": "", "vtype": "Trailer", "capacity": "", "length": "4 m", "available": True, "notes": ""},
]
RETIRED_PLACEHOLDERS = ["Disk", "Truck", "Bakkie"]
VEHICLE_TYPES = ["Medium Truck", "Large Truck", "Small Truck", "Bakkie", "Trailer", "Other"]

EXPENSE_CATEGORIES = ["General", "Materials", "Fuel", "Salaries", "Rent", "Utilities", "Vehicle", "Maintenance", "Other"]

DEFAULT_SETTINGS = {
    "id": "singleton",
    "company_name": "SUPER IQ-FOAM",
    "address": "", "telephone": "", "email": "", "logo": "",
    "banking_details": "", "tax_number": "",
    "tax_enabled": False, "tax_rate": 15.0,
    "invoice_prefix": "IQF",
    "payment_terms": ["Due on Delivery", "Cash on Delivery", "7 Days", "14 Days", "30 Days", "Custom Terms"],
    "payment_methods": ["Cash", "Bank Transfer", "Card", "Other"],
    "default_payment_terms": "Due on Delivery",
    "resting_hours": 12,
    "safety_stock": 10,
    "departments": ["Production", "Cutting", "Sewing", "Mattress Processing", "Dispatch", "Administration", "Drivers"],
    "expense_categories": EXPENSE_CATEGORIES,
    "vehicle_types": VEHICLE_TYPES,
    "product_categories": ["Standard", "Ribbon", "Ribbon Black & Pink", "Candy", "Strong Boy", "Uncovered", "Uncovered Blue 16 Density"],
    "bundle_sizes": {"default": 5, "50": 10, "75": 10},
    "timezone": "Africa/Johannesburg",
}
