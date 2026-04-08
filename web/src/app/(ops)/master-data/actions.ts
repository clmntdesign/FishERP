"use server";

import { revalidatePath } from "next/cache";
import {
  canWriteMasterData,
  type AppRole,
  requireUser,
} from "@/lib/auth";

export type MasterDataFormState = {
  error: string | null;
  success: string | null;
};

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const raw = String(formData.get(key) ?? "").trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

async function getMasterWriteContext() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role as AppRole | null) ?? "admin";

  if (!canWriteMasterData(role)) {
    return {
      supabase: null,
      error: "기준정보 수정 권한이 없습니다.",
    };
  }

  return { supabase, error: null };
}

export async function createSupplierAction(
  _previousState: MasterDataFormState,
  formData: FormData,
): Promise<MasterDataFormState> {
  const ctx = await getMasterWriteContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error, success: null };

  const code = textValue(formData, "code").toUpperCase();
  const nameKr = textValue(formData, "name_kr");
  const nameEn = textValue(formData, "name_en");
  const countryCode = textValue(formData, "country_code").toUpperCase() || "JP";
  const paymentTermsDays = numberValue(formData, "payment_terms_days", 30);

  if (!code || !nameKr) {
    return { error: "공급처 코드와 한글명을 입력해 주세요.", success: null };
  }

  const { error } = await ctx.supabase.from("suppliers").insert({
    code,
    name_kr: nameKr,
    name_en: nameEn || null,
    country_code: countryCode,
    payment_terms_days: paymentTermsDays,
  });

  if (error?.code === "23505") {
    return { error: "이미 존재하는 공급처 코드입니다.", success: null };
  }

  if (error) {
    return { error: "공급처 저장 중 오류가 발생했습니다.", success: null };
  }

  revalidatePath("/master-data");
  return { error: null, success: "공급처가 추가되었습니다." };
}

export async function createBuyerAction(
  _previousState: MasterDataFormState,
  formData: FormData,
): Promise<MasterDataFormState> {
  const ctx = await getMasterWriteContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error, success: null };

  const code = textValue(formData, "code").toUpperCase();
  const name = textValue(formData, "name");
  const paymentTermsDays = numberValue(formData, "payment_terms_days", 14);

  if (!code || !name) {
    return { error: "거래처 코드와 이름을 입력해 주세요.", success: null };
  }

  const { error } = await ctx.supabase.from("buyers").insert({
    code,
    name,
    payment_terms_days: paymentTermsDays,
  });

  if (error?.code === "23505") {
    return { error: "이미 존재하는 거래처 코드입니다.", success: null };
  }

  if (error) {
    return { error: "거래처 저장 중 오류가 발생했습니다.", success: null };
  }

  revalidatePath("/master-data");
  return { error: null, success: "거래처가 추가되었습니다." };
}

export async function createSpeciesAction(
  _previousState: MasterDataFormState,
  formData: FormData,
): Promise<MasterDataFormState> {
  const ctx = await getMasterWriteContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error, success: null };

  const code = textValue(formData, "code").toUpperCase();
  const nameKr = textValue(formData, "name_kr");
  const nameEn = textValue(formData, "name_en");
  const unitRaw = textValue(formData, "unit");
  const unit = unitRaw === "kg" ? "kg" : "unit";

  if (!code || !nameKr) {
    return { error: "품종 코드와 한글명을 입력해 주세요.", success: null };
  }

  const { error } = await ctx.supabase.from("species").insert({
    code,
    name_kr: nameKr,
    name_en: nameEn || null,
    unit,
  });

  if (error?.code === "23505") {
    return { error: "이미 존재하는 품종 코드입니다.", success: null };
  }

  if (error) {
    return { error: "품종 저장 중 오류가 발생했습니다.", success: null };
  }

  revalidatePath("/master-data");
  return { error: null, success: "품종이 추가되었습니다." };
}
