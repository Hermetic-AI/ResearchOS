"""Path whitelist for the sandbox: everything must stay inside the project root."""

from pathlib import Path


class SandboxViolation(Exception):
    """Raised when a path escapes the project root whitelist."""


def resolve_inside(root: Path, path: str) -> Path:
    """Resolve `path` against `root` and verify the result stays inside it."""
    candidate = Path(path)
    resolved = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()
    root_resolved = root.resolve()
    if resolved != root_resolved and root_resolved not in resolved.parents:
        raise SandboxViolation(f"path escapes project root: {path}")
    return resolved
