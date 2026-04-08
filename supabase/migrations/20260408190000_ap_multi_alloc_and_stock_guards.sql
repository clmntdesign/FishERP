create or replace function public.create_ap_payment_with_allocations(
  p_supplier_id uuid,
  p_payment_date date,
  p_total_amount_krw bigint,
  p_bank_reference text default null,
  p_notes text default null,
  p_allocations jsonb default '[]'::jsonb
)
returns table (
  payment_id uuid,
  credit_transaction_id uuid,
  allocated_total_krw bigint,
  unallocated_amount_krw bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_credit_transaction_id uuid;
  v_item jsonb;
  v_tx_id uuid;
  v_tx_id_raw text;
  v_amount_raw text;
  v_requested_amount bigint;
  v_tx_supplier_id uuid;
  v_tx_amount bigint;
  v_existing_allocated bigint;
  v_remaining bigint;
  v_allocated_total bigint := 0;
  v_seen_transaction_ids uuid[] := '{}'::uuid[];
begin
  if p_supplier_id is null then
    raise exception '공급처를 선택해 주세요.';
  end if;

  if p_payment_date is null then
    raise exception '지급일은 필수입니다.';
  end if;

  if p_total_amount_krw is null or p_total_amount_krw <= 0 then
    raise exception '지급 금액은 0보다 큰 값이어야 합니다.';
  end if;

  if p_allocations is null then
    p_allocations := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception '배정 데이터 형식이 올바르지 않습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtext('ap-supplier:' || p_supplier_id::text)::bigint);

  insert into public.ap_payments (
    supplier_id,
    payment_date,
    total_amount_krw,
    bank_reference,
    notes,
    created_by
  )
  values (
    p_supplier_id,
    p_payment_date,
    p_total_amount_krw,
    nullif(trim(coalesce(p_bank_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into v_payment_id;

  insert into public.ap_transactions (
    supplier_id,
    transaction_date,
    type,
    amount_krw,
    bank_reference,
    description,
    created_by
  )
  values (
    p_supplier_id,
    p_payment_date,
    'credit',
    p_total_amount_krw,
    nullif(trim(coalesce(p_bank_reference, '')), ''),
    case
      when nullif(trim(coalesce(p_notes, '')), '') is null then '지급 등록'
      else '지급: ' || trim(coalesce(p_notes, ''))
    end,
    auth.uid()
  )
  returning id into v_credit_transaction_id;

  for v_item in
    select value
    from jsonb_array_elements(p_allocations)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception '배정 데이터 형식이 올바르지 않습니다.';
    end if;

    v_tx_id_raw := trim(coalesce(v_item ->> 'ap_transaction_id', ''));
    v_amount_raw := trim(coalesce(v_item ->> 'allocated_amount_krw', ''));

    if v_tx_id_raw = '' and v_amount_raw = '' then
      continue;
    end if;

    if v_tx_id_raw = '' then
      raise exception '배정 대상 차변이 누락되었습니다.';
    end if;

    begin
      v_tx_id := v_tx_id_raw::uuid;
    exception when invalid_text_representation then
      raise exception '배정 대상 식별자가 올바르지 않습니다.';
    end;

    if v_amount_raw !~ '^\d+$' then
      raise exception '배정 금액은 0 이상의 정수여야 합니다.';
    end if;

    v_requested_amount := v_amount_raw::bigint;
    if v_requested_amount <= 0 then
      continue;
    end if;

    if v_tx_id = any(v_seen_transaction_ids) then
      raise exception '동일 차변이 중복 배정되었습니다.';
    end if;
    v_seen_transaction_ids := array_append(v_seen_transaction_ids, v_tx_id);

    select
      t.supplier_id,
      t.amount_krw
    into
      v_tx_supplier_id,
      v_tx_amount
    from public.ap_transactions t
    where t.id = v_tx_id
      and t.type = 'debit'
    for update;

    if not found then
      raise exception '선택한 차변 거래를 찾을 수 없습니다.';
    end if;

    if v_tx_supplier_id <> p_supplier_id then
      raise exception '배정 차변의 공급처가 지급 공급처와 일치하지 않습니다.';
    end if;

    select
      coalesce(sum(a.allocated_amount_krw), 0)::bigint
    into v_existing_allocated
    from public.ap_payment_allocations a
    where a.ap_transaction_id = v_tx_id;

    v_remaining := v_tx_amount - v_existing_allocated;

    if v_remaining <= 0 then
      raise exception '선택한 차변은 이미 전액 배정되었습니다.';
    end if;

    if v_requested_amount > v_remaining then
      raise exception '배정 금액이 차변 잔액을 초과했습니다.';
    end if;

    if (v_allocated_total + v_requested_amount) > p_total_amount_krw then
      raise exception '배정 합계가 지급금액을 초과했습니다.';
    end if;

    insert into public.ap_payment_allocations (
      ap_payment_id,
      ap_transaction_id,
      allocated_amount_krw
    )
    values (
      v_payment_id,
      v_tx_id,
      v_requested_amount
    );

    v_allocated_total := v_allocated_total + v_requested_amount;
  end loop;

  return query
  select
    v_payment_id,
    v_credit_transaction_id,
    v_allocated_total,
    (p_total_amount_krw - v_allocated_total);
end;
$$;

grant execute on function public.create_ap_payment_with_allocations(
  uuid,
  date,
  bigint,
  text,
  text,
  jsonb
) to authenticated;

update public.shipments
set assigned_buyer_id = created_by
where assigned_buyer_id is null
  and created_by is not null;

alter table public.shipments
alter column assigned_buyer_id set default auth.uid();

create or replace function public.create_sale_with_stock_guard(
  p_shipment_id uuid,
  p_species_id uuid,
  p_buyer_id uuid,
  p_dispatch_date date,
  p_quantity numeric,
  p_unit_price_krw bigint,
  p_expected_payment_date date default null,
  p_notes text default null
)
returns table (
  sale_id uuid,
  remaining_qty numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_intake_qty numeric := 0;
  v_sold_qty numeric := 0;
  v_mortality_qty numeric := 0;
  v_remaining_qty numeric := 0;
begin
  if p_shipment_id is null or p_species_id is null or p_buyer_id is null or p_dispatch_date is null then
    raise exception '배치/품종/거래처/출하일은 필수입니다.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception '판매 수량은 0보다 커야 합니다.';
  end if;

  if p_unit_price_krw is null or p_unit_price_krw <= 0 then
    raise exception '판매 단가는 0보다 큰 금액이어야 합니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('stock:' || p_shipment_id::text || ':' || p_species_id::text)::bigint
  );

  perform 1
  from public.shipment_line_items li
  where li.shipment_id = p_shipment_id
    and li.species_id = p_species_id
  for update;

  if not found then
    raise exception '선택한 배치에는 해당 품종 입고 기록이 없습니다.';
  end if;

  select
    coalesce(sum(li.quantity), 0)::numeric
  into v_intake_qty
  from public.shipment_line_items li
  where li.shipment_id = p_shipment_id
    and li.species_id = p_species_id;

  select
    coalesce(sum(sa.quantity), 0)::numeric
  into v_sold_qty
  from public.sales sa
  where sa.shipment_id = p_shipment_id
    and sa.species_id = p_species_id;

  select
    coalesce(sum(mr.quantity), 0)::numeric
  into v_mortality_qty
  from public.mortality_records mr
  where mr.shipment_id = p_shipment_id
    and mr.species_id = p_species_id;

  v_remaining_qty := v_intake_qty - v_sold_qty - v_mortality_qty;

  if p_quantity > v_remaining_qty then
    raise exception '재고 부족: 현재 잔량 % 보다 큰 수량은 판매할 수 없습니다.', v_remaining_qty;
  end if;

  insert into public.sales (
    shipment_id,
    buyer_id,
    dispatch_date,
    species_id,
    quantity,
    unit_price_krw,
    expected_payment_date,
    status,
    notes
  )
  values (
    p_shipment_id,
    p_buyer_id,
    p_dispatch_date,
    p_species_id,
    p_quantity,
    p_unit_price_krw,
    p_expected_payment_date,
    'dispatched',
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_sale_id;

  return query
  select
    v_sale_id,
    (v_remaining_qty - p_quantity)::numeric;
end;
$$;

grant execute on function public.create_sale_with_stock_guard(
  uuid,
  uuid,
  uuid,
  date,
  numeric,
  bigint,
  date,
  text
) to authenticated;

create or replace function public.record_mortality_with_stock_guard(
  p_shipment_id uuid,
  p_species_id uuid,
  p_recorded_date date,
  p_quantity numeric,
  p_cause public.mortality_cause default 'unknown',
  p_notes text default null
)
returns table (
  mortality_id uuid,
  remaining_qty numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mortality_id uuid;
  v_intake_qty numeric := 0;
  v_sold_qty numeric := 0;
  v_mortality_qty numeric := 0;
  v_remaining_qty numeric := 0;
begin
  if p_shipment_id is null or p_species_id is null or p_recorded_date is null then
    raise exception '배치/품종/기록일은 필수입니다.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception '폐사 수량은 0보다 커야 합니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('stock:' || p_shipment_id::text || ':' || p_species_id::text)::bigint
  );

  perform 1
  from public.shipment_line_items li
  where li.shipment_id = p_shipment_id
    and li.species_id = p_species_id
  for update;

  if not found then
    raise exception '선택한 배치에는 해당 품종 입고 기록이 없습니다.';
  end if;

  select
    coalesce(sum(li.quantity), 0)::numeric
  into v_intake_qty
  from public.shipment_line_items li
  where li.shipment_id = p_shipment_id
    and li.species_id = p_species_id;

  select
    coalesce(sum(sa.quantity), 0)::numeric
  into v_sold_qty
  from public.sales sa
  where sa.shipment_id = p_shipment_id
    and sa.species_id = p_species_id;

  select
    coalesce(sum(mr.quantity), 0)::numeric
  into v_mortality_qty
  from public.mortality_records mr
  where mr.shipment_id = p_shipment_id
    and mr.species_id = p_species_id;

  v_remaining_qty := v_intake_qty - v_sold_qty - v_mortality_qty;

  if p_quantity > v_remaining_qty then
    raise exception '재고 부족: 현재 잔량 % 보다 큰 수량은 기록할 수 없습니다.', v_remaining_qty;
  end if;

  insert into public.mortality_records (
    shipment_id,
    species_id,
    recorded_date,
    quantity,
    cause,
    notes,
    recorded_by
  )
  values (
    p_shipment_id,
    p_species_id,
    p_recorded_date,
    p_quantity,
    p_cause,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into v_mortality_id;

  return query
  select
    v_mortality_id,
    (v_remaining_qty - p_quantity)::numeric;
end;
$$;

grant execute on function public.record_mortality_with_stock_guard(
  uuid,
  uuid,
  date,
  numeric,
  public.mortality_cause,
  text
) to authenticated;
