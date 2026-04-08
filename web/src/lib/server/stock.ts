import type { requireUser } from "@/lib/auth";

type AppSupabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type ShipmentSpeciesStock = {
  intakeQty: number;
  soldQty: number;
  mortalityQty: number;
  remainingQty: number;
};

export async function getShipmentSpeciesStock(
  supabase: AppSupabase,
  shipmentId: string,
  speciesId: string,
): Promise<ShipmentSpeciesStock> {
  const [lineRes, salesRes, mortalityRes] = await Promise.all([
    supabase
      .from("shipment_line_items")
      .select("quantity")
      .eq("shipment_id", shipmentId)
      .eq("species_id", speciesId),
    supabase
      .from("sales")
      .select("quantity")
      .eq("shipment_id", shipmentId)
      .eq("species_id", speciesId),
    supabase
      .from("mortality_records")
      .select("quantity")
      .eq("shipment_id", shipmentId)
      .eq("species_id", speciesId),
  ]);

  if (lineRes.error) {
    throw new Error(`재고 조회(입고) 실패: ${lineRes.error.message}`);
  }
  if (salesRes.error) {
    throw new Error(`재고 조회(판매) 실패: ${salesRes.error.message}`);
  }
  if (mortalityRes.error) {
    throw new Error(`재고 조회(폐사) 실패: ${mortalityRes.error.message}`);
  }

  const intakeQty = (lineRes.data ?? []).reduce((sum, row) => sum + toNumber(row.quantity), 0);
  const soldQty = (salesRes.data ?? []).reduce((sum, row) => sum + toNumber(row.quantity), 0);
  const mortalityQty = (mortalityRes.data ?? []).reduce(
    (sum, row) => sum + toNumber(row.quantity),
    0,
  );

  return {
    intakeQty,
    soldQty,
    mortalityQty,
    remainingQty: intakeQty - soldQty - mortalityQty,
  };
}
