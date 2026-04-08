#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import unicodedata
import uuid
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
SHEET_DATE_RE = re.compile(r"(?P<m>\d{1,2})\.(?P<d>\d{1,2})")
CUSTOMS_DATE_RE = re.compile(
    r"통관일\s*:?\s*(?P<y>\d{4})년\s*(?P<m>\d{1,2})월\s*(?P<d>\d{1,2})일"
)

WORKBOOK_IMPORT = "import"
WORKBOOK_AP = "ap"

AP_SUMMARY_SHEETS = {"전체미지급"}
IMPORT_NON_SHIPMENT_SHEETS = {"합계수지잔", "전체미지급", "DAIKEI", "DAIYUU", "홍주", "미즈모토"}

SUPPLIER_ALIASES = {
    "DAIKEI": "DAIKEI",
    "다이케이": "DAIKEI",
    "DAIYUU": "DAIYUU",
    "다이유": "DAIYUU",
    "HONGJU": "HONGJU",
    "홍주": "HONGJU",
    "MIZUMOTO": "MIZUMOTO",
    "미즈모토": "MIZUMOTO",
}

SPECIES_ALIASES = {
    "먹장어": "HAGFISH",
    "무라사키": "MURASAKI",
    "자바리": "KELP_GROUPER",
}

BUYER_ALIASES = {
    "JYS": "JYS",
    "jys": "JYS",
    "기장수산": "GIJANG",
    "깔구리": "KKALGURI",
    "깔구리수산": "KKALGURI",
    "깔꾸리": "KKALGURI",
    "깔꾸리수산식당": "KKALGURI",
    "동암": "DONGAM",
    "소매": "RETAIL",
    "신라": "SILLA",
    "에스엠": "SM",
    "일진": "ILJIN",
    "일진(강용대)": "ILJIN",
    "판매대손": "BAD_DEBT",
    "수금대손": "BAD_DEBT",
    "해금": "HAEGEUM",
    "해금수산": "HAEGEUM",
}

COST_TYPE_ALIASES = {
    "수조비": "tank_fee",
    "일용직입고": "day_labor_intake",
    "일용직출고": "day_labor_management",
    "한국차운임": "domestic_freight",
    "한국차 운임": "domestic_freight",
    "통관비": "customs_fee",
    "추가검사": "extra_inspection",
    "망비": "net_cost",
    "출장비": "travel_expense",
    "액체산소": "liquid_oxygen",
}

IGNORE_ROW_KEYWORDS = {"소계", "합계", "잔량", "월계", "누계", "전체"}

SALES_IGNORE_KEYWORDS = {
    "출하",
    "품명",
    "판매처",
    "판매단가",
    "판매금액",
    "입금일",
    "공제후 판매이익",
    "유통이력완료",
}

SALES_BAD_DEBT_KEYWORDS = {"판매대손", "수금대손"}
AP_SUMMARY_KEYWORDS = {"월계", "누계"}
MANUAL_IGNORE_SOURCE_KEYS: set[str] = set()


@dataclass
class CellData:
    row: int
    col: int
    value: str


@dataclass
class RawRow:
    workbook_type: str
    sheet_name: str
    row_number: int
    section: str
    source_key: str
    row_status: str
    raw_cells: list[str]
    parsed_payload: dict[str, Any]


@dataclass
class EntityRow:
    workbook_type: str
    sheet_name: str
    row_number: int | None
    entity_type: str
    source_key: str
    entity_status: str
    payload: dict[str, Any]


@dataclass
class QuarantineRow:
    workbook_type: str
    sheet_name: str
    row_number: int | None
    source_key: str
    issue_code: str
    severity: str
    message: str
    raw_cells: list[str]
    parsed_payload: dict[str, Any]


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
    normalized = unicodedata.normalize("NFC", name).strip()
    safe = re.sub(r"[^0-9A-Za-z가-힣_-]+", "_", normalized)
    safe = re.sub(r"_+", "_", safe).strip("_")
    return safe or "sheet"


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def sql_literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        return f"'{sql_escape(json.dumps(value, ensure_ascii=False))}'::jsonb"
    if isinstance(value, dt.date):
        return f"'{value.isoformat()}'"
    return f"'{sql_escape(str(value))}'"


def load_rules(rules_file: Path | None) -> dict[str, Any]:
    rules: dict[str, Any] = {
        "supplier_aliases": dict(SUPPLIER_ALIASES),
        "species_aliases": dict(SPECIES_ALIASES),
        "buyer_aliases": dict(BUYER_ALIASES),
        "sales_ignore_keywords": sorted(SALES_IGNORE_KEYWORDS),
        "sales_bad_debt_keywords": sorted(SALES_BAD_DEBT_KEYWORDS),
        "ap_summary_keywords": sorted(AP_SUMMARY_KEYWORDS),
        "manual_ignore_source_keys": sorted(MANUAL_IGNORE_SOURCE_KEYS),
    }

    if rules_file is None:
        return rules

    if not rules_file.exists():
        return rules

    loaded = json.loads(rules_file.read_text(encoding="utf-8"))

    for key in ("supplier_aliases", "species_aliases", "buyer_aliases"):
        if key in loaded and isinstance(loaded[key], dict):
            merged = dict(rules[key])
            for alias, code in loaded[key].items():
                alias_text = str(alias).strip()
                code_text = str(code).strip()
                if alias_text and code_text:
                    merged[alias_text] = code_text
            rules[key] = merged

    for key in (
        "sales_ignore_keywords",
        "sales_bad_debt_keywords",
        "ap_summary_keywords",
        "manual_ignore_source_keys",
    ):
        if key in loaded and isinstance(loaded[key], list):
            merged = set(str(item).strip() for item in rules[key])
            for item in loaded[key]:
                text = str(item).strip()
                if text:
                    merged.add(text)
            rules[key] = sorted(merged)

    return rules


def read_xml_from_zip(zf: zipfile.ZipFile, path: str) -> ET.Element:
    with zf.open(path) as fp:
        return ET.fromstring(fp.read())


def read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []

    root = read_xml_from_zip(zf, "xl/sharedStrings.xml")
    values: list[str] = []

    for si in root.findall("main:si", NS):
        parts = []
        for t in si.findall(".//main:t", NS):
            parts.append(t.text or "")
        values.append("".join(parts))

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

            result.append(CellData(row=row_num, col=col_num, value=value.strip()))

    return result


def cells_to_rows(cells: list[CellData]) -> dict[int, list[str]]:
    max_col = max((c.col for c in cells), default=0)
    by_row: dict[int, list[str]] = {}

    for c in cells:
        row = by_row.setdefault(c.row, [""] * max_col)
        if len(row) < max_col:
            row.extend([""] * (max_col - len(row)))
        row[c.col - 1] = c.value

    return {k: v for k, v in by_row.items() if any(item.strip() for item in v)}


def text_at(row: list[str], index: int) -> str:
    if index < 0 or index >= len(row):
        return ""
    return row[index].strip()


def normalize_numeric(text: str) -> float | None:
    value = text.strip()
    if not value:
        return None
    value = value.replace(",", "")
    value = value.replace("₩", "")
    value = value.replace("원", "")
    if re.fullmatch(r"[-+]?\d+(\.\d+)?", value):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def excel_serial_to_date(serial: float) -> dt.date:
    base = dt.datetime(1899, 12, 30)
    converted = base + dt.timedelta(days=float(serial))
    return converted.date()


def parse_date_value(text: str, fallback_year: int | None = None) -> str | None:
    value = text.strip()
    if not value:
        return None

    numeric = normalize_numeric(value)
    if numeric is not None and 30000 <= numeric <= 60000:
        return excel_serial_to_date(numeric).isoformat()

    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass

    md_match = re.fullmatch(r"(\d{1,2})\.(\d{1,2})", value)
    if md_match and fallback_year is not None:
        month = int(md_match.group(1))
        day = int(md_match.group(2))
        try:
            return dt.date(fallback_year, month, day).isoformat()
        except ValueError:
            return None

    return None


def slugify_code(text: str, prefix: str) -> str:
    upper = re.sub(r"[^A-Za-z0-9]+", "_", text.upper()).strip("_")
    if upper:
        return f"{prefix}_{upper}"[:32]
    digest = uuid.uuid5(uuid.NAMESPACE_DNS, text).hex[:8].upper()
    return f"{prefix}_{digest}"[:32]


def identify_supplier_code(
    values: list[str], sheet_name: str, supplier_aliases: dict[str, str]
) -> tuple[str | None, str | None]:
    joined = " ".join(v for v in values if v)
    for alias, code in supplier_aliases.items():
        if alias in joined:
            return code, None

    if "다이유" in sheet_name:
        return "DAIYUU", "sheet_name_fallback"
    if sheet_name.upper().endswith("D"):
        return "DAIKEI", "sheet_name_fallback"
    if SHEET_DATE_RE.search(sheet_name):
        return "DAIYUU", "sheet_name_fallback"
    return None, "supplier_not_found"


def parse_customs_date(values: list[str]) -> str | None:
    for value in values:
        match = CUSTOMS_DATE_RE.search(value)
        if not match:
            continue
        y = int(match.group("y"))
        m = int(match.group("m"))
        d = int(match.group("d"))
        try:
            return dt.date(y, m, d).isoformat()
        except ValueError:
            return None
    return None


def should_ignore_row(values: list[str]) -> bool:
    joined = " ".join(v for v in values if v)
    if not joined:
        return True
    for keyword in IGNORE_ROW_KEYWORDS:
        if keyword in joined:
            return True
    return False


def detect_ap_ledger_columns(rows: dict[int, list[str]]) -> dict[str, int]:
    indexes = {
        "date": 0,
        "description": 1,
        "debit": 5,
        "credit": 6,
        "balance": 7,
        "bank_reference": 8,
    }

    for row_number in sorted(rows.keys()):
        row = rows[row_number]
        normalized = [cell.strip() for cell in row]
        if "날짜" not in normalized or "차변" not in normalized or "대변" not in normalized:
            continue

        indexes["date"] = normalized.index("날짜")
        indexes["description"] = normalized.index("적요") if "적요" in normalized else 1
        indexes["debit"] = normalized.index("차변")
        indexes["credit"] = normalized.index("대변")
        indexes["balance"] = normalized.index("잔액") if "잔액" in normalized else indexes["credit"] + 1
        indexes["bank_reference"] = (
            normalized.index("비고") if "비고" in normalized else indexes["balance"] + 1
        )
        break

    return indexes


class IngestState:
    def __init__(self, default_year: int, rules: dict[str, Any]):
        self.default_year = default_year
        self.rules = rules
        self.supplier_aliases = dict(rules.get("supplier_aliases", {}))
        self.species_aliases = dict(rules.get("species_aliases", {}))
        self.buyer_aliases = dict(rules.get("buyer_aliases", {}))
        self.sales_ignore_keywords = set(rules.get("sales_ignore_keywords", []))
        self.sales_bad_debt_keywords = set(rules.get("sales_bad_debt_keywords", []))
        self.ap_summary_keywords = set(rules.get("ap_summary_keywords", []))
        self.manual_ignore_source_keys = set(rules.get("manual_ignore_source_keys", []))
        self.raw_rows: list[RawRow] = []
        self.entities: list[EntityRow] = []
        self.quarantine: list[QuarantineRow] = []
        self.auto_species_map: dict[str, str] = {}
        self.auto_buyer_map: dict[str, str] = {}

    def add_raw(
        self,
        workbook_type: str,
        sheet_name: str,
        row_number: int,
        section: str,
        source_key: str,
        row_status: str,
        raw_cells: list[str],
        parsed_payload: dict[str, Any] | None = None,
    ) -> None:
        self.raw_rows.append(
            RawRow(
                workbook_type=workbook_type,
                sheet_name=sheet_name,
                row_number=row_number,
                section=section,
                source_key=source_key,
                row_status=row_status,
                raw_cells=raw_cells,
                parsed_payload=parsed_payload or {},
            )
        )

    def add_entity(
        self,
        workbook_type: str,
        sheet_name: str,
        row_number: int | None,
        entity_type: str,
        source_key: str,
        payload: dict[str, Any],
        entity_status: str = "ready",
    ) -> None:
        self.entities.append(
            EntityRow(
                workbook_type=workbook_type,
                sheet_name=sheet_name,
                row_number=row_number,
                entity_type=entity_type,
                source_key=source_key,
                payload=payload,
                entity_status=entity_status,
            )
        )

    def add_quarantine(
        self,
        workbook_type: str,
        sheet_name: str,
        row_number: int | None,
        source_key: str,
        issue_code: str,
        message: str,
        raw_cells: list[str],
        parsed_payload: dict[str, Any] | None = None,
        severity: str = "error",
    ) -> None:
        self.quarantine.append(
            QuarantineRow(
                workbook_type=workbook_type,
                sheet_name=sheet_name,
                row_number=row_number,
                source_key=source_key,
                issue_code=issue_code,
                message=message,
                severity=severity,
                raw_cells=raw_cells,
                parsed_payload=parsed_payload or {},
            )
        )

    def resolve_species_code(
        self,
        species_name: str,
        workbook_type: str,
        sheet_name: str,
        row_number: int,
        source_key: str,
        raw_cells: list[str],
    ) -> str | None:
        if not species_name:
            return None

        if species_name in self.species_aliases:
            return self.species_aliases[species_name]

        code = self.auto_species_map.get(species_name)
        if code:
            return code

        generated = slugify_code(species_name, "MIGSP")
        self.auto_species_map[species_name] = generated
        self.add_quarantine(
            workbook_type=workbook_type,
            sheet_name=sheet_name,
            row_number=row_number,
            source_key=source_key,
            issue_code="UNKNOWN_SPECIES_AUTO_CODE",
            severity="warning",
            message=f"미등록 품종 '{species_name}' 을(를) {generated} 코드로 자동 매핑했습니다.",
            raw_cells=raw_cells,
            parsed_payload={"species_name": species_name, "generated_code": generated},
        )
        return generated

    def resolve_buyer_code(
        self,
        buyer_name: str,
        workbook_type: str,
        sheet_name: str,
        row_number: int,
        source_key: str,
        raw_cells: list[str],
    ) -> str | None:
        name = buyer_name.strip()
        if not name:
            return None

        if name in self.buyer_aliases:
            return self.buyer_aliases[name]

        code = self.auto_buyer_map.get(name)
        if code:
            return code

        generated = slugify_code(name, "MIGBY")
        self.auto_buyer_map[name] = generated
        self.add_quarantine(
            workbook_type=workbook_type,
            sheet_name=sheet_name,
            row_number=row_number,
            source_key=source_key,
            issue_code="BUYER_AUTO_CODE",
            severity="warning",
            message=f"거래처 '{name}' 을(를) {generated} 코드로 자동 매핑했습니다.",
            raw_cells=raw_cells,
            parsed_payload={"buyer_name": name, "generated_code": generated},
        )
        return generated

    def should_ignore_sales_row(self, row: list[str]) -> bool:
        joined = " ".join(v for v in row if v)
        if not joined:
            return True

        for keyword in self.sales_ignore_keywords:
            if keyword and keyword in joined:
                return True

        dispatch_text = text_at(row, 1)
        if dispatch_text in {"출하", "합계", "공제후 판매이익"}:
            return True

        return False

    def is_bad_debt_row(self, row: list[str], buyer_name: str, amount: float | None) -> bool:
        if amount is not None and amount < 0:
            return True

        for keyword in self.sales_bad_debt_keywords:
            if keyword and keyword in buyer_name:
                return True

            joined = " ".join(v for v in row if v)
            if keyword and keyword in joined:
                return True

        return False

    def should_ignore_ap_summary_row(self, row: list[str]) -> bool:
        joined = " ".join(v for v in row if v)
        for keyword in self.ap_summary_keywords:
            if keyword and keyword in joined:
                return True
        return False


def parse_import_workbook(xlsx_path: Path, state: IngestState) -> None:
    with zipfile.ZipFile(xlsx_path, "r") as zf:
        shared_strings = read_shared_strings(zf)
        sheets = read_workbook_sheets(zf)

        for sheet_name, worksheet_path in sheets:
            cells = parse_worksheet_cells(zf, worksheet_path, shared_strings)
            rows = cells_to_rows(cells)
            ap_columns = detect_ap_ledger_columns(rows)
            ap_columns = detect_ap_ledger_columns(rows)

            is_shipment_sheet = sheet_name not in IMPORT_NON_SHIPMENT_SHEETS
            all_values = [value for row in rows.values() for value in row if value]

            supplier_code, supplier_hint = identify_supplier_code(
                all_values,
                sheet_name,
                state.supplier_aliases,
            )
            intake_date = None
            customs_date = parse_customs_date(all_values)
            assigned_buyer_name = ""
            fx_rate = None

            section = "unknown"
            last_sale_species = ""
            sale_qty_sum = 0.0
            intake_qty_sum = 0.0

            if is_shipment_sheet:
                sheet_date_match = SHEET_DATE_RE.search(sheet_name)
                if sheet_date_match:
                    m = int(sheet_date_match.group("m"))
                    d = int(sheet_date_match.group("d"))
                    try:
                        intake_date = dt.date(state.default_year, m, d).isoformat()
                    except ValueError:
                        intake_date = None

            shipment_source_key = f"{WORKBOOK_IMPORT}|{sheet_name}|shipment"

            for row_number in sorted(rows.keys()):
                row = rows[row_number]
                source_key = f"{WORKBOOK_IMPORT}|{sheet_name}|r{row_number}"
                joined = " ".join(v for v in row if v)

                if source_key in state.manual_ignore_source_keys:
                    state.add_quarantine(
                        workbook_type=WORKBOOK_IMPORT,
                        sheet_name=sheet_name,
                        row_number=row_number,
                        source_key=source_key,
                        issue_code="MANUAL_OVERRIDE_IGNORED",
                        severity="warning",
                        message="규칙 파일에 의해 수동 제외된 행입니다.",
                        raw_cells=row,
                    )
                    state.add_raw(
                        workbook_type=WORKBOOK_IMPORT,
                        sheet_name=sheet_name,
                        row_number=row_number,
                        section=section,
                        source_key=source_key,
                        row_status="ignored",
                        raw_cells=row,
                        parsed_payload={},
                    )
                    continue

                if "< 수 입 예 상 구 입 현 황 >" in joined:
                    section = "purchase"
                    state.add_raw(
                        workbook_type=WORKBOOK_IMPORT,
                        sheet_name=sheet_name,
                        row_number=row_number,
                        section=section,
                        source_key=source_key,
                        row_status="ignored",
                        raw_cells=row,
                        parsed_payload={},
                    )
                    continue
                elif "< 판 매 현 황 >" in joined:
                    section = "sales"
                    state.add_raw(
                        workbook_type=WORKBOOK_IMPORT,
                        sheet_name=sheet_name,
                        row_number=row_number,
                        section=section,
                        source_key=source_key,
                        row_status="ignored",
                        raw_cells=row,
                        parsed_payload={},
                    )
                    continue

                parsed_payload: dict[str, Any] = {}
                row_status = "parsed"

                if "입고일" in joined and intake_date is None:
                    candidate = parse_date_value(text_at(row, 5), fallback_year=state.default_year)
                    if candidate:
                        intake_date = candidate

                if "구매담당" in joined and not assigned_buyer_name:
                    assigned_buyer_name = text_at(row, 2)

                if section == "purchase":
                    label = text_at(row, 3)

                    if label == "물대":
                        fx_candidate = normalize_numeric(text_at(row, 5))
                        if fx_candidate is not None and fx_candidate > 0:
                            fx_rate = round(float(fx_candidate), 4)
                            parsed_payload["fx_rate"] = fx_rate
                        else:
                            state.add_quarantine(
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                issue_code="FX_RATE_MISSING",
                                severity="warning",
                                message="물대 행에서 유효한 환율을 찾지 못했습니다.",
                                raw_cells=row,
                            )

                    qty = normalize_numeric(text_at(row, 4))
                    unit_price = normalize_numeric(text_at(row, 5))
                    amount = normalize_numeric(text_at(row, 6))

                    if label in COST_TYPE_ALIASES:
                        cost_amount = amount
                        if cost_amount is None:
                            state.add_quarantine(
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                issue_code="ANCILLARY_COST_MISSING_AMOUNT",
                                severity="warning",
                                message=f"부대비용 '{label}' 금액이 비어 있습니다.",
                                raw_cells=row,
                            )
                        elif cost_amount < 0:
                            state.add_quarantine(
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                issue_code="ANCILLARY_COST_NEGATIVE",
                                message=f"부대비용 '{label}' 금액이 음수입니다.",
                                raw_cells=row,
                                parsed_payload={"amount": cost_amount},
                            )
                        elif label != "물대":
                            cost_date = parse_date_value(text_at(row, 7), fallback_year=state.default_year)
                            if not cost_date:
                                cost_date = intake_date

                            state.add_entity(
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                entity_type="ancillary_cost",
                                source_key=source_key,
                                payload={
                                    "shipment_source_key": shipment_source_key,
                                    "cost_type": COST_TYPE_ALIASES[label],
                                    "amount_krw": int(round(cost_amount)),
                                    "cost_date": cost_date,
                                    "notes": text_at(row, 7) or None,
                                },
                            )

                    elif (
                        is_shipment_sheet
                        and label
                        and label not in {"품명/규격", "구입처"}
                        and label not in COST_TYPE_ALIASES
                        and label not in IGNORE_ROW_KEYWORDS
                        and qty is not None
                        and unit_price is not None
                        and amount is not None
                    ):
                        species_code = state.resolve_species_code(
                            species_name=label,
                            workbook_type=WORKBOOK_IMPORT,
                            sheet_name=sheet_name,
                            row_number=row_number,
                            source_key=source_key,
                            raw_cells=row,
                        )
                        if species_code is None:
                            state.add_quarantine(
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                issue_code="SPECIES_MISSING",
                                message="품종명을 해석할 수 없습니다.",
                                raw_cells=row,
                            )
                        elif qty <= 0:
                            state.add_quarantine(
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                issue_code="LINE_ITEM_NON_POSITIVE_QTY",
                                message="입고 품종 수량이 0 이하입니다.",
                                raw_cells=row,
                                parsed_payload={"quantity": qty},
                            )
                        elif unit_price < 0 or amount < 0:
                            state.add_quarantine(
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                issue_code="LINE_ITEM_NEGATIVE_VALUE",
                                message="입고 품종 금액/단가가 음수입니다.",
                                raw_cells=row,
                                parsed_payload={
                                    "unit_price_jpy": unit_price,
                                    "total_jpy": amount,
                                },
                            )
                        else:
                            intake_qty_sum += qty
                            state.add_entity(
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                entity_type="shipment_line_item",
                                source_key=source_key,
                                payload={
                                    "shipment_source_key": shipment_source_key,
                                    "species_code": species_code,
                                    "species_name_kr": label,
                                    "quantity": round(float(qty), 2),
                                    "unit_price_jpy": int(round(unit_price)),
                                    "total_jpy": round(float(amount), 2),
                                    "grade_code": text_at(row, 7) or None,
                                },
                            )

                elif section == "sales":
                    dispatch_date = parse_date_value(text_at(row, 1), fallback_year=state.default_year)
                    raw_species_name = text_at(row, 2)
                    species_name = raw_species_name
                    buyer_name = text_at(row, 3)
                    qty = normalize_numeric(text_at(row, 4))
                    unit_price = normalize_numeric(text_at(row, 5))
                    amount = normalize_numeric(text_at(row, 6))
                    actual_payment_date = parse_date_value(
                        text_at(row, 7), fallback_year=state.default_year
                    )

                    alt_dispatch_date = parse_date_value(
                        text_at(row, 10), fallback_year=state.default_year
                    ) or parse_date_value(text_at(row, 11), fallback_year=state.default_year)
                    if dispatch_date is None and alt_dispatch_date is not None:
                        dispatch_date = alt_dispatch_date

                    alt_buyer_name = text_at(row, 11)
                    if (
                        not buyer_name
                        and alt_buyer_name
                        and alt_buyer_name not in {"폐사", "유통이력완료"}
                        and parse_date_value(alt_buyer_name, fallback_year=state.default_year)
                        is None
                    ):
                        buyer_name = alt_buyer_name

                    alt_species_name = text_at(row, 8)
                    if (
                        not raw_species_name
                        and alt_species_name
                        and alt_species_name in state.species_aliases
                    ):
                        species_name = alt_species_name

                    if unit_price is None and amount is not None and amount == 0 and qty is not None and qty > 0:
                        unit_price = 0.0

                    if state.should_ignore_sales_row(row):
                        row_status = "ignored"
                    else:
                        if raw_species_name and raw_species_name not in {
                            "품명",
                            "소계",
                            "잔량",
                        }:
                            last_sale_species = raw_species_name
                        elif not raw_species_name and last_sale_species:
                            species_name = last_sale_species

                        if state.is_bad_debt_row(row, buyer_name, amount):
                            adjustment_amount = (
                                abs(int(round(amount))) if amount is not None else 0
                            )
                            if adjustment_amount <= 0:
                                state.add_quarantine(
                                    workbook_type=WORKBOOK_IMPORT,
                                    sheet_name=sheet_name,
                                    row_number=row_number,
                                    source_key=source_key,
                                    issue_code="BAD_DEBT_AMOUNT_MISSING",
                                    message="대손/음수 판매 행 금액을 해석하지 못했습니다.",
                                    raw_cells=row,
                                    parsed_payload={"amount": amount},
                                    severity="warning",
                                )
                            else:
                                buyer_code = state.resolve_buyer_code(
                                    buyer_name=buyer_name or "미상",
                                    workbook_type=WORKBOOK_IMPORT,
                                    sheet_name=sheet_name,
                                    row_number=row_number,
                                    source_key=source_key,
                                    raw_cells=row,
                                )

                                if buyer_code:
                                    state.add_entity(
                                        workbook_type=WORKBOOK_IMPORT,
                                        sheet_name=sheet_name,
                                        row_number=row_number,
                                        entity_type="receivable_adjustment",
                                        source_key=source_key,
                                        payload={
                                            "shipment_source_key": shipment_source_key,
                                            "buyer_code": buyer_code,
                                            "buyer_name": buyer_name or "미상",
                                            "adjustment_type": "bad_debt_writeoff",
                                            "recorded_date": dispatch_date
                                            or intake_date
                                            or actual_payment_date,
                                            "amount_krw": adjustment_amount,
                                            "original_amount": amount,
                                            "notes": text_at(row, 8)
                                            or "Legacy bad debt adjustment",
                                        },
                                    )

                        elif (
                            dispatch_date
                            and buyer_name
                            and qty is not None
                            and unit_price is not None
                            and amount is not None
                            and qty > 0
                            and unit_price >= 0
                            and amount >= 0
                        ):
                            if buyer_name == "폐사":
                                state.add_quarantine(
                                    workbook_type=WORKBOOK_IMPORT,
                                    sheet_name=sheet_name,
                                    row_number=row_number,
                                    source_key=source_key,
                                    issue_code="SALE_POSSIBLE_MORTALITY",
                                    severity="warning",
                                    message="판매 구간에서 폐사 추정 행이 감지되어 수동 확인이 필요합니다.",
                                    raw_cells=row,
                                    parsed_payload={
                                        "dispatch_date": dispatch_date,
                                        "species_name": species_name,
                                        "quantity": qty,
                                        "amount": amount,
                                    },
                                )
                                row_status = "ignored"
                                continue

                            species_code = state.resolve_species_code(
                                species_name=species_name,
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                raw_cells=row,
                            )
                            buyer_code = state.resolve_buyer_code(
                                buyer_name=buyer_name,
                                workbook_type=WORKBOOK_IMPORT,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                raw_cells=row,
                            )

                            if species_code and buyer_code:
                                sale_qty_sum += qty
                                expected_payment_date = actual_payment_date
                                if expected_payment_date is None:
                                    dispatch = dt.date.fromisoformat(dispatch_date)
                                    expected_payment_date = (dispatch + dt.timedelta(days=7)).isoformat()

                                status = "paid" if actual_payment_date else "invoiced"

                                state.add_entity(
                                    workbook_type=WORKBOOK_IMPORT,
                                    sheet_name=sheet_name,
                                    row_number=row_number,
                                    entity_type="sale",
                                    source_key=source_key,
                                    payload={
                                        "shipment_source_key": shipment_source_key,
                                        "buyer_code": buyer_code,
                                        "buyer_name": buyer_name,
                                        "dispatch_date": dispatch_date,
                                        "species_code": species_code,
                                        "species_name_kr": species_name,
                                        "quantity": round(float(qty), 2),
                                        "unit_price_krw": int(round(unit_price)),
                                        "total_krw": int(round(amount)),
                                        "expected_payment_date": expected_payment_date,
                                        "actual_payment_date": actual_payment_date,
                                        "status": status,
                                        "notes": text_at(row, 8) or None,
                                    },
                                )
                        elif any(text_at(row, idx) for idx in (1, 2, 3, 4, 5, 6, 7)) and not should_ignore_row(row):
                            has_zero_placeholder = (
                                amount is not None
                                and amount == 0
                                and (qty is None or qty == 0)
                                and not buyer_name
                                and not raw_species_name
                            )

                            if has_zero_placeholder:
                                row_status = "ignored"
                            else:
                                state.add_quarantine(
                                    workbook_type=WORKBOOK_IMPORT,
                                    sheet_name=sheet_name,
                                    row_number=row_number,
                                    source_key=source_key,
                                    issue_code="SALE_ROW_PARSE_FAILED",
                                    message="판매 행 필수 컬럼을 해석하지 못했습니다.",
                                    raw_cells=row,
                                    parsed_payload={
                                        "dispatch_date": dispatch_date,
                                        "buyer_name": buyer_name,
                                        "species_name": species_name,
                                        "quantity": qty,
                                        "unit_price": unit_price,
                                        "amount": amount,
                                    },
                                )

                if should_ignore_row(row):
                    row_status = "ignored"

                state.add_raw(
                    workbook_type=WORKBOOK_IMPORT,
                    sheet_name=sheet_name,
                    row_number=row_number,
                    section=section,
                    source_key=source_key,
                    row_status=row_status,
                    raw_cells=row,
                    parsed_payload=parsed_payload,
                )

            if not is_shipment_sheet:
                continue

            if intake_date is None:
                state.add_quarantine(
                    workbook_type=WORKBOOK_IMPORT,
                    sheet_name=sheet_name,
                    row_number=None,
                    source_key=shipment_source_key,
                    issue_code="SHIPMENT_INTAKE_DATE_MISSING",
                    message="배치 입고일을 추정하지 못해 이관 대상에서 제외합니다.",
                    raw_cells=[],
                )
                continue

            if supplier_code is None:
                state.add_quarantine(
                    workbook_type=WORKBOOK_IMPORT,
                    sheet_name=sheet_name,
                    row_number=None,
                    source_key=shipment_source_key,
                    issue_code="SHIPMENT_SUPPLIER_MISSING",
                    message="공급처를 식별하지 못해 이관 대상에서 제외합니다.",
                    raw_cells=[],
                )
                continue

            if supplier_hint == "sheet_name_fallback":
                state.add_quarantine(
                    workbook_type=WORKBOOK_IMPORT,
                    sheet_name=sheet_name,
                    row_number=None,
                    source_key=shipment_source_key,
                    issue_code="SUPPLIER_SHEETNAME_FALLBACK",
                    severity="warning",
                    message="공급처를 시트명 규칙으로 추정했습니다.",
                    raw_cells=[],
                    parsed_payload={"supplier_code": supplier_code},
                )

            remaining_qty = max(intake_qty_sum - sale_qty_sum, 0)
            if sale_qty_sum <= 0:
                status = "in_tank"
            elif remaining_qty > 0:
                status = "partially_sold"
            else:
                status = "completed"

            shipment_number = f"LEGACY-{state.default_year}-{normalize_sheet_name(sheet_name).upper()}"
            state.add_entity(
                workbook_type=WORKBOOK_IMPORT,
                sheet_name=sheet_name,
                row_number=None,
                entity_type="shipment",
                source_key=shipment_source_key,
                payload={
                    "shipment_number": shipment_number,
                    "supplier_code": supplier_code,
                    "intake_date": intake_date,
                    "customs_date": customs_date,
                    "status": status,
                    "fx_rate": fx_rate,
                    "legacy_sheet_name": sheet_name,
                    "assigned_buyer_name": assigned_buyer_name or None,
                    "notes": f"Legacy import source sheet: {sheet_name}",
                },
            )


def parse_ap_workbook(xlsx_path: Path, state: IngestState) -> None:
    with zipfile.ZipFile(xlsx_path, "r") as zf:
        shared_strings = read_shared_strings(zf)
        sheets = read_workbook_sheets(zf)

        for sheet_name, worksheet_path in sheets:
            cells = parse_worksheet_cells(zf, worksheet_path, shared_strings)
            rows = cells_to_rows(cells)
            ap_columns = detect_ap_ledger_columns(rows)

            section = "ledger"
            if sheet_name in AP_SUMMARY_SHEETS:
                section = "summary"

            supplier_code, supplier_hint = identify_supplier_code(
                [sheet_name],
                sheet_name,
                state.supplier_aliases,
            )
            if section == "ledger" and supplier_code is None:
                state.add_quarantine(
                    workbook_type=WORKBOOK_AP,
                    sheet_name=sheet_name,
                    row_number=None,
                    source_key=f"{WORKBOOK_AP}|{sheet_name}|sheet",
                    issue_code="AP_SUPPLIER_NOT_FOUND",
                    message="AP 시트 공급처를 인식하지 못했습니다.",
                    raw_cells=[],
                )

            if supplier_hint == "sheet_name_fallback" and section == "ledger":
                state.add_quarantine(
                    workbook_type=WORKBOOK_AP,
                    sheet_name=sheet_name,
                    row_number=None,
                    source_key=f"{WORKBOOK_AP}|{sheet_name}|sheet",
                    issue_code="AP_SUPPLIER_SHEETNAME_FALLBACK",
                    severity="warning",
                    message="AP 공급처를 시트명 규칙으로 추정했습니다.",
                    raw_cells=[],
                    parsed_payload={"supplier_code": supplier_code},
                )

            carry_date: str | None = None

            for row_number in sorted(rows.keys()):
                row = rows[row_number]
                source_key = f"{WORKBOOK_AP}|{sheet_name}|r{row_number}"

                if source_key in state.manual_ignore_source_keys:
                    state.add_quarantine(
                        workbook_type=WORKBOOK_AP,
                        sheet_name=sheet_name,
                        row_number=row_number,
                        source_key=source_key,
                        issue_code="MANUAL_OVERRIDE_IGNORED",
                        severity="warning",
                        message="규칙 파일에 의해 수동 제외된 행입니다.",
                        raw_cells=row,
                    )
                    state.add_raw(
                        workbook_type=WORKBOOK_AP,
                        sheet_name=sheet_name,
                        row_number=row_number,
                        section=section,
                        source_key=source_key,
                        row_status="ignored",
                        raw_cells=row,
                        parsed_payload={},
                    )
                    continue

                row_status = "parsed"
                if should_ignore_row(row):
                    row_status = "ignored"

                parsed_payload: dict[str, Any] = {}

                if section == "ledger" and row_status != "ignored":
                    date_text = text_at(row, ap_columns["date"])
                    description = text_at(row, ap_columns["description"])
                    debit = normalize_numeric(text_at(row, ap_columns["debit"]))
                    credit = normalize_numeric(text_at(row, ap_columns["credit"]))
                    balance = normalize_numeric(text_at(row, ap_columns["balance"]))

                    parsed_date = parse_date_value(date_text, fallback_year=state.default_year)
                    if parsed_date:
                        carry_date = parsed_date

                    if debit is None and credit is None:
                        row_status = "ignored"
                    else:
                        tx_date = parsed_date or carry_date
                        parsed_payload.update(
                            {
                                "transaction_date": tx_date,
                                "description": description,
                                "debit": debit,
                                "credit": credit,
                                "balance": balance,
                            }
                        )

                        if tx_date is None:
                            state.add_quarantine(
                                workbook_type=WORKBOOK_AP,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                issue_code="AP_DATE_MISSING",
                                message="AP 거래일을 해석하지 못했습니다.",
                                raw_cells=row,
                                parsed_payload=parsed_payload,
                            )
                        elif supplier_code is None:
                            state.add_quarantine(
                                workbook_type=WORKBOOK_AP,
                                sheet_name=sheet_name,
                                row_number=row_number,
                                source_key=source_key,
                                issue_code="AP_SUPPLIER_MISSING",
                                message="AP 공급처를 찾지 못했습니다.",
                                raw_cells=row,
                                parsed_payload=parsed_payload,
                            )
                        elif debit is not None and credit is not None and debit > 0 and credit > 0:
                            is_summary_balance_row = (
                                (description == "" or description is None)
                                and balance is not None
                                and abs(balance) < 0.00001
                                and abs(debit - credit) < 0.00001
                            )

                            if state.should_ignore_ap_summary_row(row) or is_summary_balance_row:
                                row_status = "ignored"
                            else:
                                state.add_quarantine(
                                    workbook_type=WORKBOOK_AP,
                                    sheet_name=sheet_name,
                                    row_number=row_number,
                                    source_key=source_key,
                                    issue_code="AP_BOTH_DEBIT_CREDIT",
                                    message="동일 행에 차변/대변이 동시에 존재합니다.",
                                    raw_cells=row,
                                    parsed_payload=parsed_payload,
                                )
                        else:
                            if debit is not None and debit > 0:
                                state.add_entity(
                                    workbook_type=WORKBOOK_AP,
                                    sheet_name=sheet_name,
                                    row_number=row_number,
                                    entity_type="ap_transaction",
                                    source_key=f"{source_key}|debit",
                                    payload={
                                        "supplier_code": supplier_code,
                                        "transaction_date": tx_date,
                                        "type": "debit",
                                        "amount_krw": int(round(debit)),
                                        "description": description or "Legacy AP debit",
                                        "bank_reference": text_at(row, ap_columns["bank_reference"]) or None,
                                        "legacy_sheet_name": sheet_name,
                                    },
                                )
                            if credit is not None and credit > 0:
                                state.add_entity(
                                    workbook_type=WORKBOOK_AP,
                                    sheet_name=sheet_name,
                                    row_number=row_number,
                                    entity_type="ap_transaction",
                                    source_key=f"{source_key}|credit",
                                    payload={
                                        "supplier_code": supplier_code,
                                        "transaction_date": tx_date,
                                        "type": "credit",
                                        "amount_krw": int(round(credit)),
                                        "description": description or "Legacy AP credit",
                                        "bank_reference": text_at(row, ap_columns["bank_reference"]) or None,
                                        "legacy_sheet_name": sheet_name,
                                    },
                                )

                state.add_raw(
                    workbook_type=WORKBOOK_AP,
                    sheet_name=sheet_name,
                    row_number=row_number,
                    section=section,
                    source_key=source_key,
                    row_status=row_status,
                    raw_cells=row,
                    parsed_payload=parsed_payload,
                )


def create_sql_file(
    output_sql_path: Path,
    run_id: str,
    import_path: Path,
    ap_path: Path,
    default_year: int,
    mode: str,
    state: IngestState,
) -> None:
    statements: list[str] = ["begin;"]

    statements.append(
        "\n".join(
            [
                "insert into public.historical_import_runs (",
                "  id, mode, source_import_workbook, source_ap_workbook, default_year,",
                "  status, notes, imported_row_count, parsed_entity_count, quarantined_row_count, completed_at",
                ") values (",
                f"  {sql_literal(run_id)},",
                f"  {sql_literal(mode)},",
                f"  {sql_literal(str(import_path))},",
                f"  {sql_literal(str(ap_path))},",
                f"  {sql_literal(default_year)},",
                "  'completed',",
                "  'Legacy workbook row-level staging import',",
                f"  {sql_literal(len(state.raw_rows))},",
                f"  {sql_literal(len(state.entities))},",
                f"  {sql_literal(len(state.quarantine))},",
                "  now()",
                ");",
            ]
        )
    )

    def chunked_insert(table: str, columns: list[str], rows: list[list[Any]]) -> None:
        if not rows:
            return

        chunk_size = 500
        for idx in range(0, len(rows), chunk_size):
            chunk = rows[idx : idx + chunk_size]
            values_sql = []
            for row in chunk:
                values_sql.append(
                    "(" + ", ".join(sql_literal(value) for value in row) + ")"
                )
            statements.append(
                f"insert into public.{table} ({', '.join(columns)}) values\n"
                + ",\n".join(values_sql)
                + ";"
            )

    chunked_insert(
        table="historical_import_rows",
        columns=[
            "run_id",
            "workbook_type",
            "sheet_name",
            "row_number",
            "section",
            "source_key",
            "row_status",
            "raw_cells",
            "parsed_payload",
        ],
        rows=[
            [
                run_id,
                row.workbook_type,
                row.sheet_name,
                row.row_number,
                row.section,
                row.source_key,
                row.row_status,
                row.raw_cells,
                row.parsed_payload,
            ]
            for row in state.raw_rows
        ],
    )

    chunked_insert(
        table="historical_import_entities",
        columns=[
            "run_id",
            "workbook_type",
            "sheet_name",
            "row_number",
            "entity_type",
            "source_key",
            "entity_status",
            "payload",
        ],
        rows=[
            [
                run_id,
                entity.workbook_type,
                entity.sheet_name,
                entity.row_number,
                entity.entity_type,
                entity.source_key,
                entity.entity_status,
                entity.payload,
            ]
            for entity in state.entities
        ],
    )

    chunked_insert(
        table="historical_import_quarantine",
        columns=[
            "run_id",
            "workbook_type",
            "sheet_name",
            "row_number",
            "source_key",
            "issue_code",
            "severity",
            "message",
            "raw_cells",
            "parsed_payload",
        ],
        rows=[
            [
                run_id,
                issue.workbook_type,
                issue.sheet_name,
                issue.row_number,
                issue.source_key,
                issue.issue_code,
                issue.severity,
                issue.message,
                issue.raw_cells,
                issue.parsed_payload,
            ]
            for issue in state.quarantine
        ],
    )

    statements.append("commit;")
    output_sql_path.write_text("\n\n".join(statements) + "\n", encoding="utf-8")


def create_report(
    report_path: Path,
    run_id: str,
    state: IngestState,
    sql_path: Path,
) -> None:
    by_entity: dict[str, int] = {}
    for entity in state.entities:
        by_entity[entity.entity_type] = by_entity.get(entity.entity_type, 0) + 1

    by_issue: dict[str, int] = {}
    for issue in state.quarantine:
        key = f"{issue.issue_code} ({issue.severity})"
        by_issue[key] = by_issue.get(key, 0) + 1

    by_sheet_entities: dict[str, int] = {}
    for entity in state.entities:
        key = f"{entity.workbook_type}:{entity.sheet_name}"
        by_sheet_entities[key] = by_sheet_entities.get(key, 0) + 1

    by_issue_samples: dict[str, list[QuarantineRow]] = {}
    for issue in state.quarantine:
        samples = by_issue_samples.setdefault(issue.issue_code, [])
        if len(samples) < 3:
            samples.append(issue)

    lines = [
        f"# Historical Import Staging Report ({run_id})",
        "",
        f"- Raw rows staged: {len(state.raw_rows)}",
        f"- Parsed entities: {len(state.entities)}",
        f"- Quarantine issues: {len(state.quarantine)}",
        f"- SQL file: `{sql_path}`",
        "",
        "## Entity Counts",
        "",
    ]

    if by_entity:
        for entity_type in sorted(by_entity.keys()):
            lines.append(f"- {entity_type}: {by_entity[entity_type]}")
    else:
        lines.append("- none")

    lines.extend(["", "## Quarantine Counts", ""])

    if by_issue:
        for issue_code in sorted(by_issue.keys()):
            lines.append(f"- {issue_code}: {by_issue[issue_code]}")
    else:
        lines.append("- none")

    lines.extend(["", "## Top Sheets by Parsed Entities", ""])
    if by_sheet_entities:
        for key, count in sorted(by_sheet_entities.items(), key=lambda item: item[1], reverse=True)[:15]:
            lines.append(f"- {key}: {count}")
    else:
        lines.append("- none")

    lines.extend(["", "## Quarantine Samples", ""])
    if by_issue_samples:
        for issue_code in sorted(by_issue_samples.keys()):
            lines.append(f"### {issue_code}")
            for issue in by_issue_samples[issue_code]:
                row_label = "-" if issue.row_number is None else str(issue.row_number)
                lines.append(
                    f"- `{issue.workbook_type}:{issue.sheet_name}:r{row_label}` {issue.message}"
                )
            lines.append("")
    else:
        lines.append("- none")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def apply_sql(sql_path: Path) -> None:
    cmd = ["supabase", "db", "query", "--linked", "--file", str(sql_path)]
    subprocess.run(cmd, check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest legacy OFECO workbooks into historical staging tables with quarantine.",
    )
    parser.add_argument("--import-xlsx", type=Path, required=True)
    parser.add_argument("--ap-xlsx", type=Path, required=True)
    parser.add_argument("--default-year", type=int, default=2023)
    parser.add_argument("--mode", choices=["dry_run", "append"], default="dry_run")
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=Path("migration-artifacts"),
        help="Output folder for generated SQL/report artifacts",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply generated SQL to linked Supabase project",
    )
    parser.add_argument(
        "--rules-file",
        type=Path,
        default=Path("scripts/migration/rules.json"),
        help="Path to JSON mapping/ignore rules file",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    import_path = args.import_xlsx.resolve()
    ap_path = args.ap_xlsx.resolve()
    artifact_dir = args.artifact_dir.resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)

    rules_file = args.rules_file.resolve()
    rules = load_rules(rules_file)

    run_id = str(uuid.uuid4())
    state = IngestState(default_year=args.default_year, rules=rules)

    parse_import_workbook(import_path, state)
    parse_ap_workbook(ap_path, state)

    sql_path = artifact_dir / f"historical_ingest_{run_id}.sql"
    report_path = artifact_dir / f"historical_ingest_{run_id}.md"

    create_sql_file(
        output_sql_path=sql_path,
        run_id=run_id,
        import_path=import_path,
        ap_path=ap_path,
        default_year=args.default_year,
        mode=args.mode,
        state=state,
    )
    create_report(report_path=report_path, run_id=run_id, state=state, sql_path=sql_path)

    if args.apply:
        apply_sql(sql_path)

    print(f"Run ID: {run_id}")
    print(f"SQL artifact: {sql_path}")
    print(f"Report: {report_path}")
    print(f"Rules file: {rules_file}")
    print(
        f"Counts -> rows: {len(state.raw_rows)}, entities: {len(state.entities)}, quarantine: {len(state.quarantine)}"
    )


if __name__ == "__main__":
    main()
