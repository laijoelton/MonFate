import { doc, getDocs, collection, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import type { TransitVehicle } from "@/types/monfate";

/**
 * Firestore collection `vehicles` — one document per bus, holding the
 * attributes that actually matter to riders (ramp, wheelchair space,
 * priority seats, crowding). Positions are NOT stored here: they keep
 * simulating client-side (useSimulatedFleet), since syncing real GPS
 * positions through Firestore would mean constant writes for no real
 * benefit in a hackathon demo. This collection is the "reliable mock
 * data" — real, shared, and reportable, even though nothing is attached
 * to a physical bus yet.
 */

const COLLECTION = "vehicles";

export type VehicleAttributes = Pick<
  TransitVehicle,
  "ramp_status" | "capacity_status" | "wheelchair_space_available" | "priority_seats_available"
>;

/** One-time seed: if the `vehicles` collection is empty, populate it from
 * the local simulation's initial fleet so there's real Firestore data to
 * read/report against from the first run. Safe to call every app load —
 * it no-ops once the collection has documents. */
export async function ensureVehicleDocsSeeded(
  defaultFleet: { vehicle_id: string; attrs: VehicleAttributes }[],
) {
  if (!db) return;
  const snapshot = await getDocs(collection(db, COLLECTION));
  if (!snapshot.empty) return;

  await Promise.all(
    defaultFleet.map(({ vehicle_id, attrs }) => setDoc(doc(db!, COLLECTION, vehicle_id), attrs)),
  );
}

/** Live subscription to every bus's Firestore attributes, keyed by vehicle_id. */
export function subscribeToVehicleAttributes(
  onChange: (attributesByVehicleId: Record<string, VehicleAttributes>) => void,
): Unsubscribe | null {
  if (!db) return null;
  return onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => {
      const map: Record<string, VehicleAttributes> = {};
      snapshot.docs.forEach((docSnap) => {
        map[docSnap.id] = docSnap.data() as VehicleAttributes;
      });
      onChange(map);
    },
    (error) => {
      console.error("[MonFate] Failed to subscribe to vehicle attributes:", error);
    },
  );
}

/** Writes approved attribute updates onto a specific bus's Firestore doc. */
export async function applyVehicleAttributeUpdates(
  vehicleId: string,
  updates: Partial<VehicleAttributes>,
): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  await setDoc(doc(db, COLLECTION, vehicleId), updates, { merge: true });
}
