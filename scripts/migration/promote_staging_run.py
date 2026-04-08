#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def unwrap_json_output(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict):
        if isinstance(payload.get("result"), list):
            return payload["result"]
        if isinstance(payload.get("rows"), list):
            return payload["rows"]
        if isinstance(payload.get("data"), list):
            return payload["data"]

    return []


def run_db_query(sql: str) -> list[dict[str, Any]]:
    cmd = [
        "supabase",
        "db",
        "query",
        "--linked",
        "--output",
        "json",
        sql,
    ]
    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    text = proc.stdout.strip()
    if not text:
        return []
    payload = json.loads(text)
    return unwrap_json_output(payload)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Promote parsed historical staging entities into production tables.",
    )
    parser.add_argument("--run-id", required=True, help="historical_import_runs.id")
    parser.add_argument(
        "--mode",
        choices=["pilot", "full"],
        default="pilot",
        help="Pilot promotes a limited shipment subset.",
    )
    parser.add_argument(
        "--max-shipments",
        type=int,
        default=3,
        help="Shipment count for pilot mode.",
    )
    parser.add_argument(
        "--notes",
        default="Historical promotion pipeline run",
        help="Optional note for promotion run.",
    )
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=Path("migration-artifacts"),
        help="Directory for generated promotion report.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute promotion run. If omitted, only preview SQL is printed.",
    )
    return parser.parse_args()


def build_report(
    report_path: Path,
    run_id: str,
    promotion_run_id: str,
    summary_rows: list[dict[str, Any]],
    action_rows: list[dict[str, Any]],
    manual_rows: list[dict[str, Any]],
) -> None:
    lines: list[str] = [
        f"# Historical Promotion Report ({promotion_run_id})",
        "",
        f"- Import run: `{run_id}`",
        f"- Promotion run: `{promotion_run_id}`",
        "",
        "## Summary",
        "",
    ]

    if summary_rows:
        row = summary_rows[0]
        lines.extend(
            [
                f"- Mode: {row.get('mode')}",
                f"- Status: {row.get('status')}",
                f"- Promoted: {row.get('promoted_entity_count')}",
                f"- Skipped: {row.get('skipped_entity_count')}",
                f"- Manual review: {row.get('manual_review_count')}",
                f"- Errors: {row.get('error_count')}",
            ]
        )
    else:
        lines.append("- summary not available")

    lines.extend(["", "## Action Counts", ""])
    if action_rows:
        for row in action_rows:
            lines.append(f"- {row.get('action')}: {row.get('cnt')}")
    else:
        lines.append("- none")

    lines.extend(["", "## Manual Review Sample", ""])
    if manual_rows:
        for row in manual_rows:
            lines.append(
                f"- `{row.get('source_key')}` ({row.get('target_table')}): {row.get('message') or '-'}"
            )
    else:
        lines.append("- none")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()

    args.artifact_dir.mkdir(parents=True, exist_ok=True)

    preview_sql = (
        "select public.promote_historical_import_run("
        f"'{sql_escape(args.run_id)}'::uuid, "
        f"'{sql_escape(args.mode)}', "
        f"{int(args.max_shipments)}, "
        f"'{sql_escape(args.notes)}'"
        ") as promotion_run_id;"
    )

    if not args.apply:
        print("Preview SQL:")
        print(preview_sql)
        return

    run_rows = run_db_query(preview_sql)
    if not run_rows:
        raise RuntimeError("Promotion RPC did not return a promotion run id")

    promotion_run_id = str(run_rows[0].get("promotion_run_id", "")).strip()
    if not promotion_run_id:
        raise RuntimeError("promotion_run_id is empty")

    summary_rows = run_db_query(
        "select mode, status, promoted_entity_count, skipped_entity_count, manual_review_count, error_count "
        "from public.historical_promotion_run_summary "
        f"where promotion_run_id = '{sql_escape(promotion_run_id)}'::uuid"
    )

    action_rows = run_db_query(
        "select action, count(*)::int as cnt "
        "from public.historical_promotion_links "
        f"where promotion_run_id = '{sql_escape(promotion_run_id)}'::uuid "
        "group by action order by action"
    )

    manual_rows = run_db_query(
        "select source_key, target_table, message "
        "from public.historical_promotion_links "
        f"where promotion_run_id = '{sql_escape(promotion_run_id)}'::uuid "
        "and action = 'manual_review' "
        "order by id limit 20"
    )

    report_path = args.artifact_dir / f"historical_promotion_{promotion_run_id}.md"
    build_report(
        report_path=report_path,
        run_id=args.run_id,
        promotion_run_id=promotion_run_id,
        summary_rows=summary_rows,
        action_rows=action_rows,
        manual_rows=manual_rows,
    )

    print(f"Promotion run: {promotion_run_id}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
