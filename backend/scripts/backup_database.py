"""Standalone database backup script, meant to run via cron (not part of the FastAPI app).

Usage: .venv/bin/python scripts/backup_database.py
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"


def parse_database_url(url: str) -> dict:
    # settings.database_url looks like postgresql+asyncpg://user:pass@host:port/dbname
    # pg_dump doesn't understand the "+asyncpg" driver suffix, so strip it before parsing.
    cleaned = url.replace("postgresql+asyncpg://", "postgresql://")
    parsed = urlparse(cleaned)
    return {
        "user": parsed.username,
        "password": parsed.password,
        "host": parsed.hostname,
        "port": str(parsed.port or 5432),
        "dbname": parsed.path.lstrip("/"),
    }


def run_backup() -> Path:
    BACKUP_DIR.mkdir(exist_ok=True)
    db = parse_database_url(settings.database_url)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_file = BACKUP_DIR / f"backup_{timestamp}.sql"

    env = os.environ.copy()
    env["PGPASSWORD"] = db["password"]

    command = [
        "pg_dump",
        "-h", db["host"],
        "-p", db["port"],
        "-U", db["user"],
        "-d", db["dbname"],
        "-f", str(backup_file),
    ]

    result = subprocess.run(command, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump başarısız oldu: {result.stderr}")

    return backup_file


def cleanup_old_backups() -> None:
    cutoff = datetime.now() - timedelta(days=settings.backup_retention_days)
    for backup_file in BACKUP_DIR.glob("backup_*.sql"):
        modified_at = datetime.fromtimestamp(backup_file.stat().st_mtime)
        if modified_at < cutoff:
            backup_file.unlink()
            print(f"Eski yedek silindi: {backup_file.name}")


def write_last_backup(backup_file: Path) -> None:
    """Sistem durumu sayfası bu dosyadan son yedeği okur."""
    info = {
        "at": datetime.now().isoformat(timespec="seconds"),
        "file": backup_file.name,
        "size_bytes": backup_file.stat().st_size,
    }
    (BACKUP_DIR / "last_backup.json").write_text(json.dumps(info))


if __name__ == "__main__":
    backup_file = run_backup()
    write_last_backup(backup_file)
    print(f"Yedek alındı: {backup_file}")
    cleanup_old_backups()
