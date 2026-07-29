"""DataFrame loading shared by profile/stat_test/chart."""

import json
from pathlib import Path

import pandas as pd

from . import db
from .sandbox import resolve_inside


def load_frame(root: Path, file: str) -> tuple[pd.DataFrame, str, int]:
    """Load csv/parquet/json inside the project root; returns (df, relative path, size)."""
    path = resolve_inside(root, file)
    if not path.exists():
        raise FileNotFoundError(f"data file not found: {file}")
    suffix = path.suffix.lower()
    if suffix == ".csv":
        frame = pd.read_csv(path)
    elif suffix in (".parquet", ".pq"):
        frame = pd.read_parquet(path)
    elif suffix == ".json":
        frame = pd.read_json(path)
    else:
        raise ValueError(f"unsupported data format: {suffix} (csv/parquet/json only)")
    relative = str(path.relative_to(root.resolve()))
    return frame, relative, path.stat().st_size


def register_dataset(
    conn, *, root: Path, relative: str, size: int, profile_json: dict | None = None
) -> str:
    return db.upsert_dataset(
        conn,
        path=relative,
        name=Path(relative).name,
        fmt=Path(relative).suffix.lstrip(".").lower(),
        size_bytes=size,
        profile_json=json.dumps(profile_json) if profile_json else None,
    )
