"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
};

function normalizeNextPath(value: string | null) {
  if (!value) return "/dashboard";
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = normalizeNextPath(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요." };
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return {
      error:
        "서버 설정이 완료되지 않았습니다. Railway 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)를 확인해 주세요.",
    };
  }

  let authError: { message: string } | null = null;

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    authError = error;
  } catch (error) {
    console.error("[FishERP] loginAction signInWithPassword crashed", error);
    return {
      error:
        "로그인 요청 중 서버 연결 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (authError) {
    console.error("[FishERP] loginAction auth rejected", authError.message);
    return { error: "로그인에 실패했습니다. 계정 정보를 확인해 주세요." };
  }

  redirect(nextPath);
}
