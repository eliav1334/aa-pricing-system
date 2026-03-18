"""Import data from AI-HOST JSON dumps into local SQLite"""
import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'pricing.db')

# Projects data from AI-HOST
projects = [
    {"id":"5147aba5-b084-49fc-ad3c-f1b6636a3cdf","name":"פיתוח שכונת אתרוגים אליכין","client":"ש.ברוך","type":"פיתוח","address":"אליכין","date":"2026-03-09","status":"הצעה","margin_percent":20,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
    {"id":"d45881e5-e938-4114-abf9-7f22bbd80713","name":"בורות חלחול","client":"לירן מקווה מים","type":"קידוח","address":"הרצליה","date":"2026-03-09","status":"הצעה","margin_percent":20,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
    {"id":"e8ba2230-bfa4-428f-9f0e-8633917c0103","name":"PV גניגר - חווה סולארית","client":"נקסטקום","type":"","address":"","date":"","status":"הושלם","margin_percent":15,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
    {"id":"d8b0e87f-a26d-494c-936f-64c5c7ff8d95","name":"פיתוח בית אבות חדרה","client":"עירית חדרה","type":"","address":"","date":"","status":"הושלם","margin_percent":15,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
    {"id":"9d931f1c-fbfd-4c70-a826-c3b0193109fd","name":"תשתיות מפעל בר מור","client":"בר מור יזמים","type":"","address":"","date":"","status":"הושלם","margin_percent":15,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
    {"id":"75ca287a-e5e8-4ab4-aa50-9c394e4dce4d","name":"פיתוח עתידים - אלקטרה","client":"אלקטרה","type":"","address":"","date":"","status":"הושלם","margin_percent":15,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
    {"id":"3a3162cd-516e-41ac-9de3-991002f593f9","name":"פיתוח עין הים - אלקטרה","client":"אלקטרה","type":"","address":"","date":"","status":"הושלם","margin_percent":15,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
    {"id":"6114cdbe-a577-447a-b4dc-e1f5087d5bed","name":"גניגר נקסטקום - עפר וניקוז","client":"נקסטקום","type":"","address":"","date":"","status":"בביצוע","margin_percent":15,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
    {"id":"845a9fd0-d737-4f14-a3f6-2b254219bd69","name":"שדה דב - מים וביוב","client":"לא ידוע","type":"","address":"","date":"","status":"בביצוע","margin_percent":15,"overhead_percent":0,"insurance_percent":0,"vat_included":0},
]

db = sqlite3.connect(DB_PATH)
db.execute("PRAGMA journal_mode=WAL")

# Clear existing data first
db.execute("DELETE FROM projects")
db.execute("DELETE FROM cost_items")

# Insert projects
for p in projects:
    db.execute("""INSERT OR REPLACE INTO projects (id,name,client,type,address,date,status,notes,margin_percent,overhead_percent,insurance_percent,vat_included)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
               (p['id'], p['name'], p['client'], p['type'], p['address'], p['date'], p['status'], '',
                p['margin_percent'], p['overhead_percent'], p['insurance_percent'], p['vat_included']))

db.commit()
print(f"Imported {len(projects)} projects")

# Check
cnt = db.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
print(f"Projects in DB: {cnt}")

db.close()
print("Done!")
