# Historical Migration Scaffolding

This folder contains a first-pass extraction tool for the two OFECO Excel workbooks.

## Goal

- Convert workbook data into inspectable machine-readable snapshots.
- Surface known migration risks (negative values, missing cost rows, FX-like anomalies).
- Generate CSV copies per sheet for mapping and reconciliation work.

## Script

- `extract_xlsx_snapshot.py`

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

## Notes

- The extractor intentionally uses Python standard library only (no `openpyxl` dependency).
- This is scaffolding for migration analysis; it is not yet a full import-to-database pipeline.
- Use generated summaries to define final field-level mapping and anomaly reconciliation rules.
