"""En yeni yedeği geçici bir veritabanına geri yükleyip canlı veritabanıyla karşılaştırır.

Yedek, geri yüklenemeyen bir dosya olabilir; "yedek var" ile "yedek işe yarar" aynı şey değildir.
Geçici DB (behtech_verify_<unix>) her durumda silinir. Sonuç backups/last_verify.json'a yazılır;
hata varsa çıkış kodu 1.

Usage: .venv/bin/python scripts/verify_backup.py
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from scripts.backup_database import BACKUP_DIR, parse_database_url  # noqa: E402

TABLES = [
    "tenants", "staff", "customers", "services", "appointments", "plans", "subscriptions",
    "payments", "platform_admins", "audit_logs",
]


def _psql(db: dict, dbname: str, args: list[str], env: dict) -> subprocess.CompletedProcess:
    cmd = ["psql", "-h", db["host"], "-p", db["port"], "-U", db["user"], "-d", dbname, "-v", "ON_ERROR_STOP=1", *args]
    return subprocess.run(cmd, env=env, capture_output=True, text=True)


def _count(db: dict, dbname: str, table: str, env: dict) -> int | None:
    r = _psql(db, dbname, ["-tAc", f"SELECT count(*) FROM {table}"], env)
    return int(r.stdout.strip()) if r.returncode == 0 and r.stdout.strip().isdigit() else None


def verify() -> dict:
    db = parse_database_url(settings.database_url)
    # Geçici veritabanı oluşturmak/silmek yetki ister. Uygulamanın çalışma kullanıcısına CREATEDB VERMEYİN
    # (bir açık olursa saldırganın eline geçer); ayrı bir bakım kullanıcısı tanımlayın.
    maint_user = os.environ.get("BACKUP_VERIFY_DB_USER") or os.environ.get("BACKUP_VERIFY_DB_USER".lower())
    if maint_user:
        db = {**db, "user": maint_user, "password": os.environ.get("BACKUP_VERIFY_DB_PASSWORD", "")}
    env = {**os.environ, "PGPASSWORD": db["password"] or ""}
    result = {"at": datetime.now().isoformat(timespec="seconds"), "file": None, "ok": False, "tables": {}, "error": None}

    files = sorted(BACKUP_DIR.glob("backup_*.sql"), key=lambda f: f.stat().st_mtime)
    if not files:
        result["error"] = "Hiç yedek dosyası bulunamadı"
        return result
    backup = files[-1]
    result["file"] = backup.name

    temp = f"behtech_verify_{int(time.time())}"
    created = False
    try:
        r = _psql(db, "postgres", ["-c", f'CREATE DATABASE "{temp}"'], env)
        if r.returncode != 0:
            raise RuntimeError(f"Geçici veritabanı oluşturulamadı: {r.stderr.strip()}")
        created = True
        # Not: ON_ERROR_STOP yok -> sahiplik/rol uyarıları geri yüklemeyi durdurmasın; asıl kanıt satır sayıları.
        r = subprocess.run(
            ["psql", "-h", db["host"], "-p", db["port"], "-U", db["user"], "-d", temp, "-q", "-f", str(backup)],
            env=env, capture_output=True, text=True,
        )
        if r.returncode != 0:
            raise RuntimeError(f"Geri yükleme başarısız: {r.stderr.strip()[-500:]}")
        problems = []
        for t in TABLES:
            b, live = _count(db, temp, t, env), _count(db, db["dbname"], t, env)
            result["tables"][t] = {"backup": b, "live": live}
            if b is None:
                # Eski yedekte henüz olmayan tablo (ör. audit_logs) hata sayılmaz; canlıda da yoksa zaten None.
                if live is not None and t not in ("audit_logs",):
                    problems.append(f"{t}: yedekte tablo yok")
            elif live is not None and b > live:
                problems.append(f"{t}: yedekte ({b}) canlıdan ({live}) fazla")
        if problems:
            raise RuntimeError("; ".join(problems))
        result["ok"] = True
    except Exception as exc:
        result["error"] = str(exc)[:1000]
    finally:
        if created:
            r = _psql(db, "postgres", ["-c", f'DROP DATABASE IF EXISTS "{temp}" WITH (FORCE)'], env)
            if r.returncode != 0 and result["error"] is None:
                result["ok"] = False
                result["error"] = f"Geçici veritabanı silinemedi: {r.stderr.strip()}"
    return result


if __name__ == "__main__":
    out = verify()
    BACKUP_DIR.mkdir(exist_ok=True)
    (BACKUP_DIR / "last_verify.json").write_text(json.dumps(out))
    if out["ok"]:
        print(f"Yedek doğrulandı: {out['file']} -> " + ", ".join(f"{t}={v['backup']}" for t, v in out["tables"].items()))
        sys.exit(0)
    print(f"HATA: yedek doğrulanamadı ({out['file']}): {out['error']}", file=sys.stderr)
    sys.exit(1)
