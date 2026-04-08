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

export type ShipmentStatusFormState = {
  error: string | null;
  success: string | null;
};

export type ShipmentHeaderFormState = {
  error: string | null;
  success: string | null;
};

export type ShipmentFinancialFormState = {
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
  const assignedBuyerId = textValue(formData, "assigned_buyer_id") || user.id;
  const intakeDate = parseDateValue(textValue(formData, "intake_date"));
  const customsDate = parseDateValue(textValue(formData, "customs_date"));
  const customsPermitNumber = textValue(formData, "customs_permit_number");
  const statusRaw = textValue(formData, "status");
  const fxRateRaw = textValue(formData, "fx_rate");
  const notes = textValue(formData, "notes");
  const lineItemsRaw = textValue(formData, "line_items_json");
  const ancillaryCostsRaw = textValue(formData, "ancillary_costs_json");

  if (!supplierId || !assignedBuyerId || !intakeDate) {
    return {
      error: "공급처, 구매담당, 입고일은 필수입니다.",
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
          assigned_buyer_id: assignedBuyerId,
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

export async function updateShipmentHeaderAction(
  _previousState: ShipmentHeaderFormState,
  formData: FormData,
): Promise<ShipmentHeaderFormState> {
  const { supabase, role } = await getCurrentRole();

  if (!canWriteShipments(role)) {
    return { error: "배치 수정 권한이 없습니다.", success: null };
  }

  const shipmentId = textValue(formData, "shipment_id");
  const assignedBuyerId = textValue(formData, "assigned_buyer_id");
  const customsDate = parseDateValue(textValue(formData, "customs_date"));
  const customsPermitNumber = textValue(formData, "customs_permit_number");
  const fxRateRaw = textValue(formData, "fx_rate");
  const notes = textValue(formData, "notes");

  if (!shipmentId || !assignedBuyerId) {
    return {
      error: "배치 식별자와 구매담당은 필수입니다.",
      success: null,
    };
  }

  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, status, fx_rate")
    .eq("id", shipmentId)
    .maybeSingle();

  if (shipmentError || !shipment) {
    return {
      error: `배치 조회 실패: ${shipmentError?.message ?? "배치를 찾을 수 없습니다."}`,
      success: null,
    };
  }

  const fxRate = fxRateRaw ? Number(fxRateRaw) : null;
  if (fxRateRaw && (!Number.isFinite(fxRate) || fxRate === null || fxRate <= 0)) {
    return {
      error: "환율은 0보다 큰 숫자로 입력해 주세요.",
      success: null,
    };
  }

  const currentFxRate = shipment.fx_rate === null ? null : Number(shipment.fx_rate);
  const fxRateChanged =
    (currentFxRate === null && fxRate !== null) ||
    (currentFxRate !== null && fxRate === null) ||
    (currentFxRate !== null && fxRate !== null && currentFxRate !== fxRate);

  if (shipment.status !== "pending_customs" && fxRateChanged) {
    return {
      error: "보관중(in_tank) 이후에는 환율을 수정할 수 없습니다.",
      success: null,
    };
  }

  const { error: updateError } = await supabase
    .from("shipments")
    .update({
      assigned_buyer_id: assignedBuyerId,
      customs_date: customsDate,
      customs_permit_number: customsPermitNumber || null,
      fx_rate: fxRate,
      notes: notes || null,
    })
    .eq("id", shipment.id);

  if (updateError) {
    return {
      error: `배치 수정 실패: ${updateError.message}`,
      success: null,
    };
  }

  revalidatePath("/shipments");
  revalidatePath("/dashboard");

  return {
    error: null,
    success: "배치 기본 정보가 수정되었습니다.",
  };
}

export async function updateShipmentFinancialInputsAction(
  _previousState: ShipmentFinancialFormState,
  formData: FormData,
): Promise<ShipmentFinancialFormState> {
  const { supabase, role } = await getCurrentRole();

  if (!canWriteShipments(role)) {
    return { error: "배치 수정 권한이 없습니다.", success: null };
  }

  const shipmentId = textValue(formData, "shipment_id");
  const lineItemsRaw = textValue(formData, "line_items_json");
  const ancillaryCostsRaw = textValue(formData, "ancillary_costs_json");

  if (!shipmentId) {
    return {
      error: "배치 식별자가 누락되었습니다.",
      success: null,
    };
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

  const { data, error } = await supabase.rpc("replace_shipment_financial_inputs", {
    p_shipment_id: shipmentId,
    p_line_items: lineItems,
    p_ancillary_costs: ancillaryCosts,
  });

  if (error) {
    return {
      error: `배치 라인/부대비용 수정 실패: ${error.message}`,
      success: null,
    };
  }

  const resultRow = Array.isArray(data) ? data[0] : data;
  const lineCount = Number(resultRow?.line_count ?? lineItems.length);
  const costCount = Number(resultRow?.cost_count ?? ancillaryCosts.length);

  revalidatePath("/shipments");
  revalidatePath("/dashboard");

  return {
    error: null,
    success: `배치 라인 ${lineCount.toLocaleString("ko-KR")}건, 부대비용 ${costCount.toLocaleString("ko-KR")}건으로 갱신되었습니다.`,
  };
}

export async function updateShipmentStatusAction(
  _previousState: ShipmentStatusFormState,
  formData: FormData,
): Promise<ShipmentStatusFormState> {
  const { supabase, user, role } = await getCurrentRole();

  if (!canWriteShipments(role)) {
    return { error: "배치 상태 변경 권한이 없습니다.", success: null };
  }

  const shipmentId = textValue(formData, "shipment_id");
  const statusRaw = textValue(formData, "status");

  if (!shipmentId) {
    return { error: "배치 식별자가 누락되었습니다.", success: null };
  }

  const nextStatus = allowedStatuses.includes(
    statusRaw as (typeof allowedStatuses)[number],
  )
    ? (statusRaw as (typeof allowedStatuses)[number])
    : null;

  if (!nextStatus) {
    return { error: "유효하지 않은 상태 값입니다.", success: null };
  }

  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id, shipment_number, supplier_id, intake_date, fx_rate, status")
    .eq("id", shipmentId)
    .single();

  if (shipmentError || !shipment) {
    return {
      error: `배치 조회 실패: ${shipmentError?.message ?? "배치를 찾을 수 없습니다."}`,
      success: null,
    };
  }

  if (shipment.status === nextStatus) {
    return {
      error: null,
      success: `이미 ${nextStatus} 상태입니다.`,
    };
  }

  const shouldCreateDebit = nextStatus === "in_tank" && shipment.status !== "in_tank";
  let shouldInsertDebit = false;
  let debitAmountKrw = 0;

  if (shouldCreateDebit) {
    const { data: existingDebit, error: existingDebitError } = await supabase
      .from("ap_transactions")
      .select("id")
      .eq("shipment_id", shipment.id)
      .eq("type", "debit")
      .maybeSingle();

    if (existingDebitError) {
      return {
        error: `기존 미지급 차변 조회 실패: ${existingDebitError.message}`,
        success: null,
      };
    }

    if (!existingDebit) {
      if (!shipment.fx_rate || Number(shipment.fx_rate) <= 0) {
        return {
          error: "입고 확정(in_tank) 전 환율을 반드시 입력해 주세요.",
          success: null,
        };
      }

      const { data: lineRows, error: lineRowsError } = await supabase
        .from("shipment_line_items")
        .select("total_jpy")
        .eq("shipment_id", shipment.id);

      if (lineRowsError) {
        return {
          error: `배치 금액 조회 실패: ${lineRowsError.message}`,
          success: null,
        };
      }

      const totalJpy = (lineRows ?? []).reduce(
        (sum, row) => sum + Number(row.total_jpy ?? 0),
        0,
      );

      if (!Number.isFinite(totalJpy) || totalJpy <= 0) {
        return {
          error: "차변 생성 실패: 품종 라인 합계(JPY)가 0입니다.",
          success: null,
        };
      }

      debitAmountKrw = Math.round(totalJpy * Number(shipment.fx_rate));

      if (!Number.isFinite(debitAmountKrw) || debitAmountKrw <= 0) {
        return {
          error: "차변 생성 실패: 환율 또는 금액 계산값이 유효하지 않습니다.",
          success: null,
        };
      }

      shouldInsertDebit = true;
    }
  }

  const { error: updateError } = await supabase
    .from("shipments")
    .update({ status: nextStatus })
    .eq("id", shipment.id);

  if (updateError) {
    return {
      error: `상태 변경 실패: ${updateError.message}`,
      success: null,
    };
  }

  if (shouldInsertDebit) {
    const { error: debitInsertError } = await supabase.from("ap_transactions").insert({
      supplier_id: shipment.supplier_id,
      transaction_date: shipment.intake_date,
      type: "debit",
      amount_krw: debitAmountKrw,
      shipment_id: shipment.id,
      description: `AUTO: ${shipment.shipment_number} 입고 확정 차변`,
      created_by: user.id,
    });

    if (debitInsertError && debitInsertError.code !== "23505") {
      await supabase.from("shipments").update({ status: shipment.status }).eq("id", shipment.id);

      return {
        error: `입고 확정 차변 생성 실패: ${debitInsertError.message}`,
        success: null,
      };
    }
  }

  revalidatePath("/shipments");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/payables");

  return {
    error: null,
    success: `배치 상태가 ${nextStatus}(으)로 변경되었습니다.`,
  };
}
