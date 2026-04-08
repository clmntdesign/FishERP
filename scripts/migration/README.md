# Historical Migration Scaffolding

This folder contains a first-pass extraction tool for the two OFECO Excel workbooks.

## Goal

- Convert workbook data into inspectable machine-readable snapshots.
- Surface known migration risks (negative values, missing cost rows, FX-like anomalies).
- Generate CSV copies per sheet for mapping and reconciliation work.

## Script

- `extract_xlsx_snapshot.py`
- `ingest_legacy_to_staging.py`
- `reconcile_staging_run.py`
- `promote_staging_run.py`
- `apply_receivable_adjustments.py`
- `rules.json`

### Run

```bash
python3 "scripts/migration/extract_xlsx_snapshot.py" \
  --import-xlsx "OFECO수입시트.xlsx" \
  --ap-xlsx "OFECO미지급현황.xlsx" \
  --output-dir "migration-output" \
  --export-csv
```

### Outputs

- `migration-output/migration_snapshot.json`
- `migration-output/<workbook_name>/summary.json`
- `migration-output/<workbook_name>/*.csv` (when `--export-csv` is enabled)

## Row-Level Staging Import (Recommended)

`ingest_legacy_to_staging.py` parses both workbooks row-by-row and writes:

- raw staged rows (`historical_import_rows`)
- parsed entities (`historical_import_entities`)
- anomaly/quarantine entries (`historical_import_quarantine`)

It also generates SQL/report artifacts so imports are auditable and repeatable.

### Run (generate artifacts only)

```bash
python3 "scripts/migration/ingest_legacy_to_staging.py" \
  --import-xlsx "OFECO수입시트.xlsx" \
  --ap-xlsx "OFECO미지급현황.xlsx" \
  --default-year 2023 \
  --mode dry_run
```

### Run and apply to linked Supabase

```bash
python3 "scripts/migration/ingest_legacy_to_staging.py" \
  --import-xlsx "OFECO수입시트.xlsx" \
  --ap-xlsx "OFECO미지급현황.xlsx" \
  --default-year 2023 \
  --mode append \
  --apply
```

### Artifacts

- `migration-artifacts/historical_ingest_<run-id>.sql`
- `migration-artifacts/historical_ingest_<run-id>.md`

### Quarantine behavior

- Unknown/ambiguous rows are not discarded.
- They are recorded in `historical_import_quarantine` with issue code + severity.
- Unknown buyers/species get deterministic auto-codes and warning entries for later review.
- Known outlier rows can be explicitly excluded via `manual_ignore_source_keys` in `rules.json`.

## Recommended Order (Expert)

1. Run row-level staging ingest (dry run).
2. Review quarantine + reconciliation report.
3. Update `rules.json` and parser rules to reduce errors.
4. Re-run ingest until blocking errors are resolved/sign-off ready.
5. Promote with pilot mode first, then full mode.
6. Apply receivable adjustments (bad debt write-offs) from staging entities.

## Reconciliation Report

```bash
python3 "scripts/migration/reconcile_staging_run.py" \
  --run-id "<historical-import-run-id>"
```

Output:

- `migration-artifacts/historical_reconcile_<run-id>.md`

## Promotion (pilot/full)

Preview SQL only:

```bash
python3 "scripts/migration/promote_staging_run.py" \
  --run-id "<historical-import-run-id>" \
  --mode pilot \
  --max-shipments 3
```

Apply pilot:

```bash
python3 "scripts/migration/promote_staging_run.py" \
  --run-id "<historical-import-run-id>" \
  --mode pilot \
  --max-shipments 3 \
  --apply
```

Apply full:

```bash
python3 "scripts/migration/promote_staging_run.py" \
  --run-id "<historical-import-run-id>" \
  --mode full \
  --apply
```

Output:

- `migration-artifacts/historical_promotion_<promotion-run-id>.md`
- Promotion logs in DB: `historical_promotion_runs`, `historical_promotion_links`

Note:

- `receivable_adjustment` entities are marked `manual_review` during promotion by default.

## Apply receivable adjustments

Preview SQL:

```bash
python3 "scripts/migration/apply_receivable_adjustments.py" \
  --run-id "<historical-import-run-id>" \
  --promotion-run-id "<promotion-run-id>"
```

Apply:

```bash
python3 "scripts/migration/apply_receivable_adjustments.py" \
  --run-id "<historical-import-run-id>" \
  --promotion-run-id "<promotion-run-id>" \
  --apply
```

Output:

- `migration-artifacts/receivable_adjust_apply_<run-id>.md`
- Script also deactivates synthetic buyer code `BAD_DEBT` from operational selection.

## Rules file

- Default rules live in `scripts/migration/rules.json`.
- Use this file to lock deterministic aliasing and ignore rules.
- `ingest_legacy_to_staging.py` automatically loads it by default.

## Notes

- The extractor intentionally uses Python standard library only (no `openpyxl` dependency).
- Promotion function posts only `ready` entities and preserves manual-review items.
- Use generated summaries + staging/promotion reports for final reconciliation sign-off.
