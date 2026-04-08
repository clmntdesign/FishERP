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
        for key in ("result", "rows", "data"):
            if isinstance(payload.get(key), list):
                return payload[key]

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
        description="Create reconciliation report for a historical staging run.",
    )
    parser.add_argument("--run-id", required=True, help="historical_import_runs.id")
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=Path("migration-artifacts"),
        help="Directory for reconciliation report",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run_id = sql_escape(args.run_id)

    run_rows = run_db_query(
        "select run_id, imported_row_count, parsed_entity_count, quarantined_row_count, error_count, warning_count "
        "from public.historical_import_run_summary "
        f"where run_id = '{run_id}'::uuid"
    )

    entity_rows = run_db_query(
        "select workbook_type, sheet_name, entity_type, entity_count "
        "from public.historical_import_entity_sheet_summary "
        f"where run_id = '{run_id}'::uuid "
        "order by workbook_type, sheet_name, entity_type"
    )

    quarantine_rows = run_db_query(
        "select workbook_type, issue_code, severity, issue_count "
        "from public.historical_import_quarantine_summary "
        f"where run_id = '{run_id}'::uuid "
        "order by issue_count desc, issue_code"
    )

    sample_rows = run_db_query(
        "select workbook_type, sheet_name, row_number, issue_code, severity, source_key, message "
        "from public.historical_import_quarantine "
        f"where run_id = '{run_id}'::uuid "
        "order by severity desc, issue_code, sheet_name, row_number "
        "limit 40"
    )

    lines: list[str] = [
        f"# Historical Reconciliation ({args.run_id})",
        "",
        "## Run Summary",
        "",
    ]

    if run_rows:
        row = run_rows[0]
        lines.extend(
            [
                f"- Imported rows: {row.get('imported_row_count')}",
                f"- Parsed entities: {row.get('parsed_entity_count')}",
                f"- Quarantined rows: {row.get('quarantined_row_count')}",
                f"- Errors: {row.get('error_count')}",
                f"- Warnings: {row.get('warning_count')}",
            ]
        )
    else:
        lines.append("- run not found")

    lines.extend(["", "## Quarantine Breakdown", ""])
    if quarantine_rows:
        for row in quarantine_rows:
            lines.append(
                f"- {row.get('workbook_type')} / {row.get('issue_code')} ({row.get('severity')}): {row.get('issue_count')}"
            )
    else:
        lines.append("- none")

    lines.extend(["", "## Entity Counts by Sheet", ""])
    if entity_rows:
        for row in entity_rows:
            lines.append(
                f"- {row.get('workbook_type')}:{row.get('sheet_name')} / {row.get('entity_type')}: {row.get('entity_count')}"
            )
    else:
        lines.append("- none")

    lines.extend(["", "## Quarantine Samples", ""])
    if sample_rows:
        for row in sample_rows:
            lines.append(
                f"- {row.get('severity')} {row.get('issue_code')} @ {row.get('workbook_type')}:{row.get('sheet_name')}:r{row.get('row_number')}: {row.get('message')}"
            )
    else:
        lines.append("- none")

    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.artifact_dir / f"historical_reconcile_{args.run_id}.md"
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
