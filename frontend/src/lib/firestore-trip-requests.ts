import { addDoc, collection, onSnapshot, orderBy, query, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import type { NeedType, TripRequest } from "@/types/monfate";

/**
 * Firestore collection `trip_requests` — one document per citizen trip plan
 * with declared accessibility needs. This is the real link between the
 * citizen app's "confirm trip + choose needs" flow and the admin
 * dashboard's "Passenger accessibility requests" / demand intelligence
 * views — no mock data on either side.
 */

const COLLECTION = "trip_requests";

export async function submitTripRequest(
  fromStopId: string,
  toStopId: string,
  needs: NeedType[],
  estimatedDurationSeconds: number | null,
): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  await addDoc(collection(db, COLLECTION), {
    from_stop_id: fromStopId,
    to_stop_id: toStopId,
    needs,
    estimated_duration_seconds: estimatedDurationSeconds,
    requested_at: new Date().toISOString(),
  });
}

export function subscribeToTripRequests(
  onChange: (requests: TripRequest[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe | null {
  if (!db) return null;
  const q = query(collection(db, COLLECTION), orderBy("requested_at", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const requests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as TripRequest);
      onChange(requests);
    },
    (error) => {
      console.error("[MonFate] Failed to subscribe to trip requests:", error);
      onError?.(error);
    },
  );
}
