"use server";

import { revalidatePath } from "next/cache";
import {
  canWriteShipments,
  type AppRole,
  requireUser,
} from "@/lib/auth";

export type ShipmentFormState = {
  error: string | null;
  success: string | null;
};

type LineItemInput = {
  species_id: string;
  quantity: number;
  unit_price_jpy: number;
  grade_code: string | null;
};

type AncillaryCostInput = {
  cost_type:
    | "tank_fee"
    | "day_labor_intake"
    | "domestic_freight"
    | "customs_fee"
    | "extra_inspection"
    | "net_cost"
    | "travel_expense"
    | "day_labor_management"
    | "liquid_oxygen"
    | "other";
  amount_krw: number;
  cost_date: string;
  notes: string | null;
};

const allowedStatuses = [
  "pending_customs",
  "in_tank",
  "partially_sold",
  "completed",
] as const;

const allowedCostTypes: AncillaryCostInput["cost_type"][] = [
  "tank_fee",
  "day_labor_intake",
  "domestic_freight",
  "customs_fee",
  "extra_inspection",
  "net_cost",
  "travel_expense",
  "day_labor_management",
  "liquid_oxygen",
  "other",
];

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parsePositiveNumber(raw: unknown) {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function parseNonNegativeNumber(raw: unknown) {
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function parseLineItems(raw: string): LineItemInput[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("품종 라인 데이터 형식이 잘못되었습니다.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("최소 1개 이상의 품종 라인을 입력해 주세요.");
  }

  const lines: LineItemInput[] = [];

  for (const row of parsed) {
    if (!row || typeof row !== "object") {
      throw new Error("품종 라인 데이터 형식이 잘못되었습니다.");
    }

    const speciesId = String((row as { species_id?: unknown }).species_id ?? "").trim();
    const quantity = parsePositiveNumber((row as { quantity?: unknown }).quantity);
    const unitPrice = parseNonNegativeNumber(
      (row as { unit_price_jpy?: unknown }).unit_price_jpy,
    );
    const gradeCode = String((row as { grade_code?: unknown }).grade_code ?? "").trim();

    if (!speciesId || quantity === null || unitPrice === null) {
      throw new Error("품종 라인의 품종/수량/JPY 단가를 확인해 주세요.");
    }

    lines.push({
      species_id: speciesId,
      quantity,
      unit_price_jpy: Math.round(unitPrice),
      grade_code: gradeCode || null,
    });
  }

  return lines;
}

function parseAncillaryCosts(raw: string): AncillaryCostInput[] {
  if (!raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("부대비용 데이터 형식이 잘못되었습니다.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("부대비용 데이터 형식이 잘못되었습니다.");
  }

  const costs: AncillaryCostInput[] = [];

  for (const row of parsed) {
    if (!row || typeof row !== "object") {
      throw new Error("부대비용 데이터 형식이 잘못되었습니다.");
    }

    const costType = String((row as { cost_type?: unknown }).cost_type ?? "").trim();
    const amount = parseNonNegativeNumber((row as { amount_krw?: unknown }).amount_krw);
    const costDate = String((row as { cost_date?: unknown }).cost_date ?? "").trim();
    const notes = String((row as { notes?: unknown }).notes ?? "").trim();

    if (!costType && amount === null && !costDate && !notes) {
      continue;
    }

    if (!allowedCostTypes.includes(costType as AncillaryCostInput["cost_type"])) {
      throw new Error("부대비용 유형을 다시 확인해 주세요.");
    }

    if (amount === null || !costDate) {
      throw new Error("부대비용 항목의 금액/일자를 확인해 주세요.");
    }

    costs.push({
      cost_type: costType as AncillaryCostInput["cost_type"],
      amount_krw: Math.round(amount),
      cost_date: costDate,
      notes: notes || null,
    });
  }

  return costs;
}

async function getCurrentRole() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    role: (profile?.role as AppRole | null) ?? "admin",
  };
}

async function generateShipmentNumber(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  intakeDate: string,
) {
  const year = intakeDate.slice(0, 4);
  const prefix = `SHIP-${year}-`;

  const { data, error } = await supabase
    .from("shipments")
    .select("shipment_number")
    .ilike("shipment_number", `${prefix}%`);

  if (error) {
    throw new Error("배치번호 생성 중 조회 오류가 발생했습니다.");
  }

  let maxSeq = 0;
  for (const row of data ?? []) {
    const match = String(row.shipment_number).match(/^SHIP-\d{4}-(\d+)$/);
    if (!match) continue;
    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function createShipmentAction(
  _previousState: ShipmentFormState,
  formData: FormData,
): Promise<ShipmentFormState> {
  const { supabase, user, role } = await getCurrentRole();

  if (!canWriteShipments(role)) {
    return { error: "수입 배치 등록 권한이 없습니다.", success: null };
  }

  const supplierId = textValue(formData, "supplier_id");
  const intakeDate = parseDateValue(textValue(formData, "intake_date"));
  const customsDate = parseDateValue(textValue(formData, "customs_date"));
  const customsPermitNumber = textValue(formData, "customs_permit_number");
  const statusRaw = textValue(formData, "status");
  const fxRateRaw = textValue(formData, "fx_rate");
  const notes = textValue(formData, "notes");
  const lineItemsRaw = textValue(formData, "line_items_json");
  const ancillaryCostsRaw = textValue(formData, "ancillary_costs_json");

  if (!supplierId || !intakeDate) {
    return {
      error: "공급처와 입고일은 필수입니다.",
      success: null,
    };
  }

  const status = allowedStatuses.includes(statusRaw as (typeof allowedStatuses)[number])
    ? (statusRaw as (typeof allowedStatuses)[number])
    : "pending_customs";

  const fxRate = fxRateRaw ? Number(fxRateRaw) : null;
  if (fxRateRaw && (!Number.isFinite(fxRate) || fxRate === null || fxRate <= 0)) {
    return { error: "환율은 0보다 큰 숫자로 입력해 주세요.", success: null };
  }

  let lineItems: LineItemInput[];
  let ancillaryCosts: AncillaryCostInput[];

  try {
    lineItems = parseLineItems(lineItemsRaw);
    ancillaryCosts = parseAncillaryCosts(ancillaryCostsRaw);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "입력 데이터 확인 중 오류가 발생했습니다.",
      success: null,
    };
  }

  let shipmentId: string | null = null;
  let shipmentNumber = "";

  try {
    let created = false;
    let lastError: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      shipmentNumber = await generateShipmentNumber(supabase, intakeDate);

      const { data, error } = await supabase
        .from("shipments")
        .insert({
          shipment_number: shipmentNumber,
          supplier_id: supplierId,
          intake_date: intakeDate,
          customs_date: customsDate,
          customs_permit_number: customsPermitNumber || null,
          fx_rate: fxRate,
          status,
          notes: notes || null,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (!error && data) {
        shipmentId = data.id;
        created = true;
        break;
      }

      lastError = error;
      if (error?.code !== "23505") {
        break;
      }
    }

    if (!created || !shipmentId) {
      return {
        error:
          lastError?.message ??
          "수입 배치를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        success: null,
      };
    }

    const { error: lineError } = await supabase.from("shipment_line_items").insert(
      lineItems.map((item) => ({
        shipment_id: shipmentId,
        species_id: item.species_id,
        quantity: item.quantity,
        unit_price_jpy: item.unit_price_jpy,
        total_jpy: item.quantity * item.unit_price_jpy,
        grade_code: item.grade_code,
      })),
    );

    if (lineError) {
      throw new Error(lineError.message);
    }

    if (ancillaryCosts.length > 0) {
      const { error: costError } = await supabase.from("ancillary_costs").insert(
        ancillaryCosts.map((cost) => ({
          shipment_id: shipmentId,
          cost_type: cost.cost_type,
          amount_krw: cost.amount_krw,
          cost_date: cost.cost_date,
          notes: cost.notes,
        })),
      );

      if (costError) {
        throw new Error(costError.message);
      }
    }
  } catch (error) {
    if (shipmentId) {
      await supabase.from("shipments").delete().eq("id", shipmentId);
    }

    return {
      error:
        error instanceof Error
          ? `수입 배치 저장 중 오류: ${error.message}`
          : "수입 배치 저장 중 오류가 발생했습니다.",
      success: null,
    };
  }

  revalidatePath("/shipments");

  return {
    error: null,
    success: `배치 ${shipmentNumber} 이(가) 등록되었습니다.`,
  };
}
