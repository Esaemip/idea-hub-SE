"""SQLite 연결 및 초기 스키마 생성."""

from contextlib import closing
from pathlib import Path
import sqlite3

DEFAULT_DATABASE = Path(__file__).resolve().parent / "idea_hub.sqlite3"
SCHEMA_FILE = Path(__file__).resolve().parent / "schema.sql"
SQLITE_BUSY_TIMEOUT_MS = 15_000


def connect(database_path=DEFAULT_DATABASE):
    """외래 키 검사가 켜진 연결을 반환합니다. 호출자가 연결을 닫아야 합니다."""
    connection = sqlite3.connect(database_path, timeout=SQLITE_BUSY_TIMEOUT_MS / 1_000)
    connection.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA synchronous = NORMAL")
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database(database_path=DEFAULT_DATABASE):
    """없는 테이블과 인덱스를 만듭니다. 기존 데이터는 유지합니다."""
    schema = SCHEMA_FILE.read_text(encoding="utf-8")
    with closing(connect(database_path)) as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(schema)


if __name__ == "__main__":
    initialize_database()
    print(f"DB 준비 완료: {DEFAULT_DATABASE}")
