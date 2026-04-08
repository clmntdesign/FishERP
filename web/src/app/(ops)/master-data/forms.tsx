"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  createBuyerAction,
  createSpeciesAction,
  createSupplierAction,
  initialMasterDataFormState,
} from "@/app/(ops)/master-data/actions";

function ActionMessage({ error, success }: { error: string | null; success: string | null }) {
  if (error) {
    return (
      <p className="mt-3 rounded-xl border border-warning/30 bg-orange-50 px-3 py-2 text-xs text-warning">
        {error}
      </p>
    );
  }

  if (success) {
    return (
      <p className="mt-3 rounded-xl border border-accent/30 bg-emerald-50 px-3 py-2 text-xs text-accent-strong">
        {success}
      </p>
    );
  }

  return null;
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "저장 중..." : label}
    </button>
  );
}

export function SupplierCreateForm() {
  const [state, formAction] = useActionState(
    createSupplierAction,
    initialMasterDataFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-line bg-canvas p-3">
      <h3 className="text-sm font-semibold text-text-primary">공급처 추가</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          name="code"
          required
          placeholder="코드 (예: DAIKEI)"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <input
          name="name_kr"
          required
          placeholder="한글명"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <input
          name="name_en"
          placeholder="영문명"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <input
          name="country_code"
          defaultValue="JP"
          maxLength={2}
          placeholder="국가코드"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <input
          name="payment_terms_days"
          type="number"
          min={0}
          defaultValue={30}
          placeholder="결제 조건(일)"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs sm:col-span-2"
        />
      </div>
      <SaveButton label="공급처 저장" />
      <ActionMessage error={state.error} success={state.success} />
    </form>
  );
}

export function BuyerCreateForm() {
  const [state, formAction] = useActionState(
    createBuyerAction,
    initialMasterDataFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-line bg-canvas p-3">
      <h3 className="text-sm font-semibold text-text-primary">거래처 추가</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          name="code"
          required
          placeholder="코드 (예: BUYER-A)"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <input
          name="name"
          required
          placeholder="거래처명"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <input
          name="payment_terms_days"
          type="number"
          min={0}
          defaultValue={14}
          placeholder="결제 조건(일)"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs sm:col-span-2"
        />
      </div>
      <SaveButton label="거래처 저장" />
      <ActionMessage error={state.error} success={state.success} />
    </form>
  );
}

export function SpeciesCreateForm() {
  const [state, formAction] = useActionState(
    createSpeciesAction,
    initialMasterDataFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-line bg-canvas p-3">
      <h3 className="text-sm font-semibold text-text-primary">품종 추가</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          name="code"
          required
          placeholder="코드 (예: HAGFISH)"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <input
          name="name_kr"
          required
          placeholder="한글명"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <input
          name="name_en"
          placeholder="영문명"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        />
        <select
          name="unit"
          defaultValue="unit"
          className="h-10 rounded-lg border border-line bg-white px-3 text-xs"
        >
          <option value="unit">unit (마리/개체)</option>
          <option value="kg">kg</option>
        </select>
      </div>
      <SaveButton label="품종 저장" />
      <ActionMessage error={state.error} success={state.success} />
    </form>
  );
}
