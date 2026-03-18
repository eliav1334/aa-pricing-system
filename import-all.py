#!/usr/bin/env python3
"""
Import cost_items and price_db from JSON files into local SQLite DB.
Usage: py import-all.py
"""

import json
import sqlite3
import os
import glob

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DB_PATH = os.path.join(DATA_DIR, 'pricing.db')


def load_json_files(pattern):
    """Load and merge all JSON files matching pattern."""
    files = sorted(glob.glob(os.path.join(DATA_DIR, pattern)))
    all_rows = []
    for f in files:
        with open(f, 'r', encoding='utf-8') as fh:
            rows = json.load(fh)
            all_rows.extend(rows)
        print(f"  Loaded {len(rows)} rows from {os.path.basename(f)}")
    return all_rows


def import_cost_items(cursor, rows):
    """Insert cost_items using INSERT OR REPLACE."""
    sql = """INSERT OR REPLACE INTO cost_items
        (id, project_id, category, description, unit, quantity, unit_price, total, is_actual, created_at, dekel_ref, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""

    data = []
    for r in rows:
        data.append((
            r['id'],
            r.get('project_id', ''),
            r.get('category', ''),
            r.get('description', ''),
            r.get('unit', ''),
            r.get('quantity', 0),
            r.get('unit_price', 0),
            r.get('total', 0),
            r.get('is_actual', 0),
            r.get('created_at'),
            r.get('dekel_ref', ''),
            r.get('sort_order', 0),
        ))

    cursor.executemany(sql, data)
    return len(data)


def import_price_db(cursor, rows):
    """Insert price_db using INSERT OR REPLACE."""
    sql = """INSERT OR REPLACE INTO price_db
        (id, category, name, unit, price, supplier, updated_at, dekel_id, chapter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"""

    data = []
    for r in rows:
        data.append((
            r['id'],
            r.get('category', ''),
            r.get('name', ''),
            r.get('unit', ''),
            r.get('price', 0),
            r.get('supplier', ''),
            r.get('updated_at'),
            r.get('dekel_id', ''),
            r.get('chapter', ''),
        ))

    cursor.executemany(sql, data)
    return len(data)


def main():
    print(f"Database: {DB_PATH}")
    print(f"Data dir: {DATA_DIR}")
    print()

    # Verify DB exists
    if not os.path.exists(DB_PATH):
        print("ERROR: Database file not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check existing counts
    cursor.execute("SELECT COUNT(*) FROM cost_items")
    existing_costs = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM price_db")
    existing_prices = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM projects")
    existing_projects = cursor.fetchone()[0]
    print(f"Before import:")
    print(f"  projects: {existing_projects}")
    print(f"  cost_items: {existing_costs}")
    print(f"  price_db: {existing_prices}")
    print()

    # Load cost_items
    print("Loading cost_items...")
    cost_rows = load_json_files('costs_*.json')
    print(f"  Total: {len(cost_rows)} rows")
    print()

    # Load price_db
    print("Loading price_db...")
    price_rows = load_json_files('prices_*.json')
    print(f"  Total: {len(price_rows)} rows")
    print()

    # Import in a transaction
    print("Importing to SQLite...")
    try:
        cursor.execute("BEGIN TRANSACTION")

        n_costs = import_cost_items(cursor, cost_rows)
        print(f"  Imported {n_costs} cost_items")

        n_prices = import_price_db(cursor, price_rows)
        print(f"  Imported {n_prices} price_db items")

        conn.commit()
        print("  COMMIT successful!")
    except Exception as e:
        conn.rollback()
        print(f"  ERROR: {e}")
        raise

    # Verify final counts
    cursor.execute("SELECT COUNT(*) FROM cost_items")
    final_costs = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM price_db")
    final_prices = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM projects")
    final_projects = cursor.fetchone()[0]

    print()
    print(f"After import:")
    print(f"  projects: {final_projects}")
    print(f"  cost_items: {final_costs}")
    print(f"  price_db: {final_prices}")
    print()
    print("Done!")

    conn.close()


if __name__ == '__main__':
    main()
