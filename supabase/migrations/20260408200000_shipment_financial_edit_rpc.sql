create or replace function public.replace_shipment_financial_inputs(
  p_shipment_id uuid,
  p_line_items jsonb,
  p_ancillary_costs jsonb default '[]'::jsonb
)
returns table (
  line_count integer,
  cost_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.shipment_status;
  v_line_item jsonb;
  v_cost_item jsonb;
  v_species_id uuid;
  v_quantity numeric;
  v_unit_price_jpy integer;
  v_grade_code text;
  v_total_jpy numeric;
  v_cost_type public.ancillary_cost_type;
  v_amount_krw bigint;
  v_cost_date date;
  v_notes text;
  v_line_count integer := 0;
  v_cost_count integer := 0;
begin
  if p_shipment_id is null then
    raise exception '배치 식별자가 누락되었습니다.';
  end if;

  if p_line_items is null or jsonb_typeof(p_line_items) <> 'array' then
    raise exception '품종 라인 데이터 형식이 잘못되었습니다.';
  end if;

  if jsonb_array_length(p_line_items) = 0 then
    raise exception '최소 1개 이상의 품종 라인이 필요합니다.';
  end if;

  if p_ancillary_costs is null then
    p_ancillary_costs := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_ancillary_costs) <> 'array' then
    raise exception '부대비용 데이터 형식이 잘못되었습니다.';
  end if;

  select sh.status
  into v_status
  from public.shipments sh
  where sh.id = p_shipment_id
  for update;

  if not found then
    raise exception '배치를 찾을 수 없습니다.';
  end if;

  if v_status <> 'pending_customs' then
    raise exception '통관 대기 상태에서만 라인/부대비용을 수정할 수 있습니다.';
  end if;

  delete from public.shipment_line_items
  where shipment_id = p_shipment_id;

  delete from public.ancillary_costs
  where shipment_id = p_shipment_id;

  for v_line_item in
    select value
    from jsonb_array_elements(p_line_items)
  loop
    if jsonb_typeof(v_line_item) <> 'object' then
      raise exception '품종 라인 데이터 형식이 잘못되었습니다.';
    end if;

    begin
      v_species_id := nullif(trim(coalesce(v_line_item ->> 'species_id', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception '품종 식별자 형식이 올바르지 않습니다.';
    end;

    if v_species_id is null then
      raise exception '품종 라인의 품종 정보가 누락되었습니다.';
    end if;

    begin
      v_quantity := nullif(trim(coalesce(v_line_item ->> 'quantity', '')), '')::numeric;
    exception when invalid_text_representation then
      raise exception '품종 라인의 수량 값이 올바르지 않습니다.';
    end;

    begin
      v_unit_price_jpy := nullif(trim(coalesce(v_line_item ->> 'unit_price_jpy', '')), '')::integer;
    exception when invalid_text_representation then
      raise exception '품종 라인의 JPY 단가 값이 올바르지 않습니다.';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception '품종 라인의 수량은 0보다 커야 합니다.';
    end if;

    if v_unit_price_jpy is null or v_unit_price_jpy < 0 then
      raise exception '품종 라인의 JPY 단가를 확인해 주세요.';
    end if;

    v_grade_code := nullif(trim(coalesce(v_line_item ->> 'grade_code', '')), '');
    v_total_jpy := v_quantity * v_unit_price_jpy;

    insert into public.shipment_line_items (
      shipment_id,
      species_id,
      quantity,
      unit_price_jpy,
      total_jpy,
      grade_code
    )
    values (
      p_shipment_id,
      v_species_id,
      v_quantity,
      v_unit_price_jpy,
      v_total_jpy,
      v_grade_code
    );

    v_line_count := v_line_count + 1;
  end loop;

  for v_cost_item in
    select value
    from jsonb_array_elements(p_ancillary_costs)
  loop
    if jsonb_typeof(v_cost_item) <> 'object' then
      raise exception '부대비용 데이터 형식이 잘못되었습니다.';
    end if;

    begin
      v_cost_type := nullif(trim(coalesce(v_cost_item ->> 'cost_type', '')), '')::public.ancillary_cost_type;
    exception
      when invalid_text_representation then
        raise exception '부대비용 유형을 확인해 주세요.';
    end;

    begin
      v_amount_krw := nullif(trim(coalesce(v_cost_item ->> 'amount_krw', '')), '')::bigint;
    exception when invalid_text_representation then
      raise exception '부대비용 금액 값이 올바르지 않습니다.';
    end;

    begin
      v_cost_date := nullif(trim(coalesce(v_cost_item ->> 'cost_date', '')), '')::date;
    exception when invalid_datetime_format then
      raise exception '부대비용 일자 형식이 올바르지 않습니다.';
    end;

    if v_cost_type is null then
      raise exception '부대비용 유형이 누락되었습니다.';
    end if;

    if v_amount_krw is null or v_amount_krw < 0 then
      raise exception '부대비용 금액을 확인해 주세요.';
    end if;

    if v_cost_date is null then
      raise exception '부대비용 일자를 입력해 주세요.';
    end if;

    v_notes := nullif(trim(coalesce(v_cost_item ->> 'notes', '')), '');

    insert into public.ancillary_costs (
      shipment_id,
      cost_type,
      amount_krw,
      cost_date,
      notes
    )
    values (
      p_shipment_id,
      v_cost_type,
      v_amount_krw,
      v_cost_date,
      v_notes
    );

    v_cost_count := v_cost_count + 1;
  end loop;

  return query
  select v_line_count, v_cost_count;
end;
$$;

grant execute on function public.replace_shipment_financial_inputs(
  uuid,
  jsonb,
  jsonb
) to authenticated;
