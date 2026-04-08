#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

CELL_REF_RE = re.compile(r"^([A-Z]+)(\d+)$")

MISSING_VALUE_KEYWORDS = [
    "수조비",
    "일용직입고",
    "추가검사",
    "망비",
    "운송비",
]

FX_SUSPECT_KEYWORDS = ["물대", "환율"]


@dataclass
class CellData:
    row: int
    col: int
    ref: str
    value: str


def col_to_index(col_letters: str) -> int:
    result = 0
    for char in col_letters:
        result = result * 26 + (ord(char) - ord("A") + 1)
    return result


def parse_cell_ref(ref: str) -> tuple[int, int]:
    match = CELL_REF_RE.match(ref)
    if not match:
        raise ValueError(f"Invalid cell reference: {ref}")
    col_letters, row_num = match.groups()
    return int(row_num), col_to_index(col_letters)


def normalize_sheet_name(name: str) -> str:
    safe = re.sub(r"[^0-9A-Za-z가-힣_-]+", "_", name.strip())
    safe = re.sub(r"_+", "_", safe).strip("_")
    return safe or "sheet"


def read_xml_from_zip(zf: zipfile.ZipFile, path: str) -> ET.Element:
    with zf.open(path) as fp:
        return ET.fromstring(fp.read())


def read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []

    root = read_xml_from_zip(zf, "xl/sharedStrings.xml")
    values: list[str] = []

    for si in root.findall("main:si", NS):
        text_parts = []
        for t in si.findall(".//main:t", NS):
            text_parts.append(t.text or "")
        values.append("".join(text_parts))

    return values


def read_workbook_sheets(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = read_xml_from_zip(zf, "xl/workbook.xml")
    rels = read_xml_from_zip(zf, "xl/_rels/workbook.xml.rels")

    rel_map: dict[str, str] = {}
    for rel in rels.findall("pkgrel:Relationship", NS):
        rel_id = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        if rel_id and target:
            rel_map[rel_id] = f"xl/{target}"

    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib.get("name", "")
        rel_id = sheet.attrib.get(f"{{{NS['rel']}}}id")
        if not rel_id:
            continue
        target = rel_map.get(rel_id)
        if not target:
            continue
        sheets.append((name, target))

    return sheets


def parse_worksheet_cells(
    zf: zipfile.ZipFile,
    worksheet_path: str,
    shared_strings: list[str],
) -> list[CellData]:
    root = read_xml_from_zip(zf, worksheet_path)
    rows = root.findall("main:sheetData/main:row", NS)

    result: list[CellData] = []

    for row in rows:
        for cell in row.findall("main:c", NS):
            ref = cell.attrib.get("r")
            if not ref:
                continue
            try:
                row_num, col_num = parse_cell_ref(ref)
            except ValueError:
                continue

            cell_type = cell.attrib.get("t")
            value_node = cell.find("main:v", NS)
            inline_node = cell.find("main:is/main:t", NS)

            value = ""
            if cell_type == "s" and value_node is not None and value_node.text is not None:
                try:
                    idx = int(value_node.text)
                    if 0 <= idx < len(shared_strings):
                        value = shared_strings[idx]
                except ValueError:
                    value = ""
            elif cell_type == "inlineStr" and inline_node is not None and inline_node.text:
                value = inline_node.text
            elif value_node is not None and value_node.text is not None:
                value = value_node.text

            if value.strip() == "":
                continue

            result.append(CellData(row=row_num, col=col_num, ref=ref, value=value.strip()))

    return result


def is_numeric(text: str) -> bool:
    try:
        float(text)
        return True
    except ValueError:
        return False


def analyze_sheet(sheet_name: str, cells: list[CellData]) -> dict[str, Any]:
    by_row: dict[int, list[CellData]] = {}
    for cell in cells:
        by_row.setdefault(cell.row, []).append(cell)

    for row_cells in by_row.values():
        row_cells.sort(key=lambda c: c.col)

    row_numbers = sorted(by_row.keys())
    max_col = max((c.col for c in cells), default=0)

    negative_numeric_cells = []
    missing_value_rows = []
    fx_suspect_rows = []

    for row_num in row_numbers:
        row_cells = by_row[row_num]
        text_values = [c.value for c in row_cells if not is_numeric(c.value)]
        numeric_values = [float(c.value) for c in row_cells if is_numeric(c.value)]

        for c in row_cells:
            if is_numeric(c.value) and float(c.value) < 0:
                negative_numeric_cells.append(
                    {
                        "ref": c.ref,
                        "value": c.value,
                    }
                )

        if any(keyword in " ".join(text_values) for keyword in MISSING_VALUE_KEYWORDS):
            if len(numeric_values) == 0:
                missing_value_rows.append(
                    {
                        "row": row_num,
                        "texts": text_values,
                    }
                )

        if any(keyword in " ".join(text_values) for keyword in FX_SUSPECT_KEYWORDS):
            fx_like_values = [n for n in numeric_values if 1 <= n <= 20]
            if len(fx_like_values) > 0:
                fx_suspect_rows.append(
                    {
                        "row": row_num,
                        "texts": text_values,
                        "fx_like_values": fx_like_values,
                    }
                )

    preview_rows = []
    for row_num in row_numbers[:8]:
        row_cells = by_row[row_num]
        preview_rows.append(
            {
                "row": row_num,
                "cells": [{"ref": c.ref, "value": c.value} for c in row_cells[:10]],
            }
        )

    return {
        "sheet_name": sheet_name,
        "row_count": len(row_numbers),
        "cell_count": len(cells),
        "max_col": max_col,
        "negative_numeric_cells": negative_numeric_cells,
        "missing_value_rows": missing_value_rows,
        "fx_suspect_rows": fx_suspect_rows,
        "preview_rows": preview_rows,
    }


def export_sheet_csv(path: Path, cells: list[CellData]) -> None:
    by_row: dict[int, dict[int, str]] = {}
    max_col = 0

    for c in cells:
        by_row.setdefault(c.row, {})[c.col] = c.value
        max_col = max(max_col, c.col)

    with path.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp)
        for row_num in sorted(by_row.keys()):
            row_data = by_row[row_num]
            row_values = [row_data.get(col, "") for col in range(1, max_col + 1)]
            writer.writerow(row_values)


def analyze_workbook(xlsx_path: Path, output_dir: Path, export_csv: bool) -> dict[str, Any]:
    workbook_out_dir = output_dir / normalize_sheet_name(xlsx_path.stem)
    workbook_out_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(xlsx_path, "r") as zf:
        shared_strings = read_shared_strings(zf)
        sheets = read_workbook_sheets(zf)

        analyses: list[dict[str, Any]] = []

        for sheet_name, worksheet_path in sheets:
            cells = parse_worksheet_cells(zf, worksheet_path, shared_strings)
            analysis = analyze_sheet(sheet_name, cells)
            analyses.append(analysis)

            if export_csv:
                csv_name = f"{normalize_sheet_name(sheet_name)}.csv"
                export_sheet_csv(workbook_out_dir / csv_name, cells)

    summary = {
        "workbook": str(xlsx_path),
        "sheet_count": len(analyses),
        "sheets": analyses,
    }

    with (workbook_out_dir / "summary.json").open("w", encoding="utf-8") as fp:
        json.dump(summary, fp, ensure_ascii=False, indent=2)

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create migration-ready XLSX snapshots and anomaly reports.",
    )
    parser.add_argument(
        "--import-xlsx",
        type=Path,
        required=True,
        help="Path to OFECO import workbook (.xlsx)",
    )
    parser.add_argument(
        "--ap-xlsx",
        type=Path,
        required=True,
        help="Path to OFECO AP workbook (.xlsx)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./migration-output"),
        help="Output directory for summaries and optional CSV exports",
    )
    parser.add_argument(
        "--export-csv",
        action="store_true",
        help="Also export each sheet as CSV",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    import_summary = analyze_workbook(
        xlsx_path=args.import_xlsx.resolve(),
        output_dir=output_dir,
        export_csv=args.export_csv,
    )
    ap_summary = analyze_workbook(
        xlsx_path=args.ap_xlsx.resolve(),
        output_dir=output_dir,
        export_csv=args.export_csv,
    )

    combined = {
        "workbooks": [import_summary, ap_summary],
    }

    combined_path = output_dir / "migration_snapshot.json"
    with combined_path.open("w", encoding="utf-8") as fp:
        json.dump(combined, fp, ensure_ascii=False, indent=2)

    print(f"Migration snapshot created: {combined_path}")


if __name__ == "__main__":
    main()
