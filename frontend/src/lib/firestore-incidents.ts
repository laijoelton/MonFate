import { collection, deleteDoc, doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import type { ActiveIncident } from "@/types/monfate";

/**
 * Firestore collection `route_incidents` — one document per route
 * (document id = route_id), holding the incident plus whichever detour was
 * computed for it (Google or ML fallback). This is what makes an accident
 * triggered on /admin actually show up on every citizen's map too, instead
 * of being local-only state that dies the moment you navigate away — the
 * same real-time pattern already used for obstacles, vehicle reports, and
 * trip requests elsewhere in this app.
 */

const COLLECTION = "route_incidents";

export async function writeIncident(routeId: string, activeIncident: ActiveIncident): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  await setDoc(doc(db, COLLECTION, routeId), activeIncident);
}

export async function deleteIncident(routeId: string): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  await deleteDoc(doc(db, COLLECTION, routeId));
}

/** Live subscription to every active incident, keyed by route_id — used by
 * both the admin trigger page and any read-only consumer (e.g. the citizen
 * map) so they always show the exact same state. */
export function subscribeToIncidents(
  onChange: (incidents: Record<string, ActiveIncident>) => void,
  onError?: (error: Error) => void,
): Unsubscribe | null {
  if (!db) return null;
  return onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => {
      const map: Record<string, ActiveIncident> = {};
      snapshot.docs.forEach((docSnap) => {
        map[docSnap.id] = docSnap.data() as ActiveIncident;
      });
      onChange(map);
    },
    (error) => {
      console.error("[MonFate] Failed to subscribe to route incidents:", error);
      onError?.(error);
    },
  );
}
