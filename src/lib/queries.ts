import { db } from "./db";

export const TRIP_SELECT =
  "*, driver:drivers!trips_driver_id_fkey(id,full_name,code,phone), tractor:assets!trips_tractor_id_fkey(id,code,plate,make_model,last_lat,last_lng,last_position_at,last_position_source), trailer:assets!trips_trailer_id_fkey(id,code,trailer_type), order:transport_orders(id,number,cargo_type,quantity,unit,weight_kg,delivery_due_at,customer:customers(id,name))";

export const fetchTrips = () => db.from("trips").select(TRIP_SELECT).order("created_at", { ascending: false }).limit(500);
export const fetchAssets = () => db.from("assets").select("*").order("code");
export const fetchDrivers = () => db.from("drivers").select("*").order("code");
export const fetchFinancials = () => db.from("trip_financials").select("*");

export const ASSET_LABEL = (r: Record<string, unknown>) => `${r["code"]}${r["plate"] ? ` — ${r["plate"]}` : ""}`;
