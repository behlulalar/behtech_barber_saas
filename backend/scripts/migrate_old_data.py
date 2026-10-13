"""One-time migration of the old single-tenant 'sefa_db' into the new
multi-tenant schema, under a single new tenant.

Usage: .venv/bin/python scripts/migrate_old_data.py
"""
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from scripts.backup_database import parse_database_url

OLD_DB = {"host": "localhost", "port": "5432", "user": "muhammedbehlulalar", "dbname": "sefa_db"}
NEW_TENANT_NAME = "Sefa Pertev Berber"
NEW_TENANT_SLUG = "sefapertev"


def split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def main() -> None:
    old_conn = psycopg2.connect(**OLD_DB)
    old_conn.autocommit = True
    old_cur = old_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    new_db = parse_database_url(settings.database_url)
    new_conn = psycopg2.connect(
        host=new_db["host"], port=new_db["port"], user=new_db["user"],
        password=new_db["password"], dbname=new_db["dbname"],
    )
    new_cur = new_conn.cursor()

    # Güvenlik: aynı slug'la bir tenant zaten varsa script'i tekrar çalıştırmayalım.
    new_cur.execute("SELECT id FROM tenants WHERE slug = %s", (NEW_TENANT_SLUG,))
    if new_cur.fetchone() is not None:
        print(f"'{NEW_TENANT_SLUG}' slug'lı bir tenant zaten var, migration tekrar çalıştırılmıyor.")
        return

    new_cur.execute(
        "INSERT INTO tenants (name, slug) VALUES (%s, %s) RETURNING id",
        (NEW_TENANT_NAME, NEW_TENANT_SLUG),
    )
    tenant_id = new_cur.fetchone()[0]
    print(f"Tenant oluşturuldu: id={tenant_id}, slug={NEW_TENANT_SLUG}")

    staff_id_map: dict[int, int] = {}
    customer_id_map: dict[int, int] = {}
    service_id_map: dict[int, int] = {}

    # --- staff ---
    old_cur.execute("SELECT * FROM staff")
    for row in old_cur.fetchall():
        name, surname = split_name(row["name"])
        new_cur.execute(
            """INSERT INTO staff (tenant_id, name, surname, phone, password, role, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (tenant_id, name, surname, row["phone"], row["password"], row["role"], row["created_at"]),
        )
        staff_id_map[row["id"]] = new_cur.fetchone()[0]
    print(f"staff: {len(staff_id_map)} satır taşındı")

    # --- customers ---
    old_cur.execute("SELECT * FROM customers")
    for row in old_cur.fetchall():
        new_cur.execute(
            """INSERT INTO customers (tenant_id, name, surname, phone, created_at)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (tenant_id, row["name"], row["surname"], row["phone"], row["created_at"]),
        )
        customer_id_map[row["id"]] = new_cur.fetchone()[0]
    print(f"customers: {len(customer_id_map)} satır taşındı")

    # --- services ---
    old_cur.execute("SELECT * FROM services")
    for row in old_cur.fetchall():
        new_cur.execute(
            """INSERT INTO services (tenant_id, name, price, duration_min, is_active)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (tenant_id, row["name"], row["price"], row["duration_min"], row["is_active"]),
        )
        service_id_map[row["id"]] = new_cur.fetchone()[0]
    print(f"services: {len(service_id_map)} satır taşındı")

    # --- working_hours (is_available=false olanlar atlanıyor) ---
    old_cur.execute("SELECT * FROM working_hours WHERE is_available = true")
    count = 0
    for row in old_cur.fetchall():
        new_cur.execute(
            """INSERT INTO working_hours (tenant_id, staff_id, day_of_week, start_time, end_time)
               VALUES (%s, %s, %s, %s, %s)""",
            (tenant_id, staff_id_map[row["staff_id"]], row["day_of_week"], row["start_time"], row["end_time"]),
        )
        count += 1
    print(f"working_hours: {count} satır taşındı")

    # --- time_off (off_date hem start hem end olarak kullanılıyor) ---
    old_cur.execute("SELECT * FROM time_off")
    count = 0
    for row in old_cur.fetchall():
        new_cur.execute(
            """INSERT INTO time_off (tenant_id, staff_id, start_date, end_date, reason)
               VALUES (%s, %s, %s, %s, %s)""",
            (tenant_id, staff_id_map[row["staff_id"]], row["off_date"], row["off_date"], row["reason"]),
        )
        count += 1
    print(f"time_off: {count} satır taşındı")

    # --- staff_services ---
    old_cur.execute("SELECT * FROM staff_services")
    count = 0
    for row in old_cur.fetchall():
        new_cur.execute(
            """INSERT INTO staff_services (tenant_id, staff_id, service_id, price)
               VALUES (%s, %s, %s, %s)""",
            (tenant_id, staff_id_map[row["staff_id"]], service_id_map[row["service_id"]], row["price"]),
        )
        count += 1
    print(f"staff_services: {count} satır taşındı")

    # --- payment_methods (code -> details JSONB içine) ---
    old_cur.execute("SELECT * FROM payment_methods")
    count = 0
    for row in old_cur.fetchall():
        new_cur.execute(
            """INSERT INTO payment_methods (tenant_id, name, details, is_active)
               VALUES (%s, %s, %s, %s)""",
            (tenant_id, row["name"], psycopg2.extras.Json({"code": row["code"]}), row["is_active"]),
        )
        count += 1
    print(f"payment_methods: {count} satır taşındı")

    # --- appointments ---
    old_cur.execute("SELECT * FROM appointments")
    count = 0
    for row in old_cur.fetchall():
        new_cur.execute(
            """INSERT INTO appointments
               (tenant_id, customer_id, staff_id, service_id, appointment_date, appointment_time,
                status, payment_method, reminder_sent, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                tenant_id,
                customer_id_map[row["customer_id"]],
                staff_id_map[row["staff_id"]],
                service_id_map[row["service_id"]],
                row["appointment_date"],
                row["appointment_time"],
                row["status"],
                row["payment_method"],
                row["reminder_sent"],
                row["created_at"],
            ),
        )
        count += 1
    print(f"appointments: {count} satır taşındı")

    new_conn.commit()
    print("Migration tamamlandı.")

    old_cur.close()
    old_conn.close()
    new_cur.close()
    new_conn.close()


if __name__ == "__main__":
    main()
