from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


def write_cohort_json(
    target: Path,
    rows: list[dict],
    *,
    preset: str = "balanced",
    generated_at: str | None = None,
) -> None:
    payload = {
        "generatedAt": generated_at
        or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "preset": preset,
        "rows": rows,
    }
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
