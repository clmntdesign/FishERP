"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { initialLoginState, loginAction } from "@/app/login/actions";

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const blocked = pending || Boolean(disabled);

  return (
    <button
      type="submit"
      disabled={blocked}
      className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "로그인 중..." : "로그인"}
    </button>
  );
}

type LoginFormProps = {
  nextPath: string;
  setupError: string | null;
};

export function LoginForm({ nextPath, setupError }: LoginFormProps) {
  const [state, formAction] = useActionState(loginAction, initialLoginState);

  return (
    <form action={formAction} className="app-card w-full max-w-md p-5 md:p-6">
      <input type="hidden" name="next" value={nextPath} />

      <div className="mb-5">
        <p className="title-en text-xs uppercase tracking-[0.18em]">Fish ERP</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
          운영 시스템 로그인
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          등록된 계정으로 로그인해 수입, 재고, 판매, 미지급 관리를 시작하세요.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">
            이메일
          </span>
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none ring-accent transition focus:ring-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">
            비밀번호
          </span>
          <input
            required
            type="password"
            name="password"
            autoComplete="current-password"
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none ring-accent transition focus:ring-2"
          />
        </label>
      </div>

      {state.error ? (
        <p className="mt-4 rounded-xl border border-warning/30 bg-orange-50 px-3 py-2 text-sm text-warning">
          {state.error}
        </p>
      ) : null}

      {setupError ? (
        <p className="mt-4 rounded-xl border border-warning/30 bg-orange-50 px-3 py-2 text-sm text-warning">
          {setupError}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-text-secondary">
          계정 생성은 운영 관리자 권한에서 진행합니다.
        </p>
        <SubmitButton disabled={Boolean(setupError)} />
      </div>
    </form>
  );
}
