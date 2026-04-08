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
        description="Apply receivable adjustment entities from a historical import run.",
    )
    parser.add_argument("--run-id", required=True, help="historical_import_runs.id")
    parser.add_argument(
        "--promotion-run-id",
        help="Optional historical_promotion_runs.id to update manual-review links",
    )
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=Path("migration-artifacts"),
        help="Directory for adjustment apply report",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute adjustment insertion. Otherwise, print preview SQL only.",
    )
    return parser.parse_args()


def build_insert_sql(run_id: str) -> str:
    run_id_sql = sql_escape(run_id)
    return (
        "with entities as ("
        "  select e.id as import_entity_id, e.source_key, e.payload,"
        "         sh.payload ->> 'shipment_number' as shipment_number"
        "  from public.historical_import_entities e"
        "  left join public.historical_import_entities sh"
        "    on sh.run_id = e.run_id"
        "   and sh.entity_type = 'shipment'"
        "   and sh.source_key = (e.payload ->> 'shipment_source_key')"
        f"  where e.run_id = '{run_id_sql}'::uuid"
        "    and e.entity_type = 'receivable_adjustment'"
        "    and e.entity_status = 'ready'"
        "), resolved as ("
        "  select"
        "    en.import_entity_id,"
        "    en.source_key,"
        "    b.id as buyer_id,"
        "    s.id as shipment_id,"
        "    coalesce(nullif(en.payload ->> 'recorded_date', '')::date, current_date) as adjustment_date,"
        "    coalesce(nullif(en.payload ->> 'adjustment_type', ''), 'bad_debt_writeoff') as adjustment_type,"
        "    nullif(en.payload ->> 'amount_krw', '')::bigint as amount_krw,"
        "    coalesce(nullif(en.payload ->> 'notes', ''), 'Legacy receivable adjustment') as notes"
        "  from entities en"
        "  join public.buyers b on b.code = (en.payload ->> 'buyer_code')"
        "  left join public.shipments s on s.shipment_number = en.shipment_number"
        "), inserted as ("
        "  insert into public.receivable_adjustments ("
        "    buyer_id, shipment_id, adjustment_date, adjustment_type, amount_krw, notes, source_key"
        "  )"
        "  select"
        "    buyer_id, shipment_id, adjustment_date, adjustment_type, amount_krw, notes, source_key"
        "  from resolved"
        "  where amount_krw is not null and amount_krw > 0"
        "  on conflict (source_key) do nothing"
        "  returning id, source_key"
        ")"
        "select"
        "  (select count(*) from entities)::int as entity_count,"
        "  (select count(*) from resolved)::int as resolved_count,"
        "  (select count(*) from inserted)::int as inserted_count,"
        "  ((select count(*) from resolved) - (select count(*) from inserted))::int as skipped_count;"
    )


def build_link_update_sql(promotion_run_id: str) -> str:
    promotion_id_sql = sql_escape(promotion_run_id)
    return (
        "with updated as ("
        "  update public.historical_promotion_links l"
        "  set"
        "    target_table = 'receivable_adjustments',"
        "    target_id = ra.id,"
        "    action = 'inserted',"
        "    message = 'Receivable adjustment inserted via post processor'"
        "  from public.receivable_adjustments ra"
        f"  where l.promotion_run_id = '{promotion_id_sql}'::uuid"
        "    and l.target_table = 'manual_review'"
        "    and l.source_key = ra.source_key"
        "  returning l.id"
        "), stats as ("
        "  select"
        "    count(*) filter (where action = 'inserted')::int as inserted_count,"
        "    count(*) filter (where action = 'skipped_existing')::int as skipped_count,"
        "    count(*) filter (where action = 'manual_review')::int as manual_count,"
        "    count(*) filter (where action = 'error')::int as error_count"
        "  from public.historical_promotion_links"
        f"  where promotion_run_id = '{promotion_id_sql}'::uuid"
        "), run_update as ("
        "  update public.historical_promotion_runs r"
        "  set"
        "    promoted_entity_count = s.inserted_count,"
        "    skipped_entity_count = s.skipped_count,"
        "    manual_review_count = s.manual_count,"
        "    error_count = s.error_count,"
        "    status = case when s.error_count > 0 then 'failed' else 'completed' end"
        "  from stats s"
        f"  where r.id = '{promotion_id_sql}'::uuid"
        "  returning r.id"
        ")"
        " select"
        "  (select count(*) from updated)::int as link_updated_count,"
        "  (select inserted_count from stats) as inserted_count,"
        "  (select skipped_count from stats) as skipped_count,"
        "  (select manual_count from stats) as manual_count,"
        "  (select error_count from stats) as error_count;"
    )


def write_report(
    report_path: Path,
    run_id: str,
    promotion_run_id: str | None,
    insert_result: list[dict[str, Any]],
    buyer_cleanup_result: list[dict[str, Any]] | None,
    link_result: list[dict[str, Any]] | None,
) -> None:
    lines: list[str] = [
        f"# Receivable Adjustment Apply ({run_id})",
        "",
        f"- Import run: `{run_id}`",
    ]

    if promotion_run_id:
        lines.append(f"- Promotion run: `{promotion_run_id}`")

    lines.extend(["", "## Insert Result", ""])
    if insert_result:
        row = insert_result[0]
        lines.extend(
            [
                f"- Entities: {row.get('entity_count')}",
                f"- Resolved: {row.get('resolved_count')}",
                f"- Inserted: {row.get('inserted_count')}",
                f"- Skipped: {row.get('skipped_count')}",
            ]
        )
    else:
        lines.append("- no result")

    if link_result is not None:
        lines.extend(["", "## Promotion Link Update", ""])
        if link_result:
            row = link_result[0]
            lines.extend(
                [
                    f"- Updated links: {row.get('link_updated_count')}",
                    f"- Run inserted count: {row.get('inserted_count')}",
                    f"- Run skipped count: {row.get('skipped_count')}",
                    f"- Run manual count: {row.get('manual_count')}",
                    f"- Run error count: {row.get('error_count')}",
                ]
            )
        else:
            lines.append("- no result")

    if buyer_cleanup_result is not None:
        lines.extend(["", "## Synthetic Buyer Cleanup", ""])
        if buyer_cleanup_result:
            lines.append(f"- BAD_DEBT set inactive: {len(buyer_cleanup_result)} row(s)")
        else:
            lines.append("- no changes")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    insert_sql = build_insert_sql(args.run_id)

    if not args.apply:
        print("Preview SQL (insert adjustments):")
        print(insert_sql)
        if args.promotion_run_id:
            print("\nPreview SQL (update promotion links):")
            print(build_link_update_sql(args.promotion_run_id))
        return

    insert_result = run_db_query(insert_sql)

    buyer_cleanup_result = run_db_query(
        "update public.buyers "
        "set is_active = false "
        "where code = 'BAD_DEBT' and is_active = true "
        "returning code"
    )

    link_result: list[dict[str, Any]] | None = None
    if args.promotion_run_id:
        link_result = run_db_query(build_link_update_sql(args.promotion_run_id))

    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.artifact_dir / f"receivable_adjust_apply_{args.run_id}.md"
    write_report(
        report_path=report_path,
        run_id=args.run_id,
        promotion_run_id=args.promotion_run_id,
        insert_result=insert_result,
        buyer_cleanup_result=buyer_cleanup_result,
        link_result=link_result,
    )

    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
