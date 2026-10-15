import os
from pathlib import Path


def project_root() -> Path:
    configured = os.environ.get("RESEARCHOS_PROJECT_ROOT")
    if configured:
        return Path(configured).resolve()
    current = Path.cwd().resolve()
    return next((parent for parent in (current, *current.parents) if (parent / ".git").exists()), current)


def resolve_inside(root: Path, value: str) -> Path:
    candidate = Path(value)
    resolved = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"path escapes project root: {value}")
    return resolved


def relative_to_root(root: Path, value: Path) -> str:
    return value.resolve().relative_to(root.resolve()).as_posix()
