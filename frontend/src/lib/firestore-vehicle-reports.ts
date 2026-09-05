import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { applyVehicleAttributeUpdates, type VehicleAttributes } from "./firestore-vehicles";
import type { VehicleReport } from "@/types/monfate";

/**
 * Firestore collection `vehicle_reports` — a rider's report about a bus
 * (e.g. "no ramp", "wheelchair space available") sits here with
 * status: "pending" until an admin approves it via the /admin page.
 * Approving is what actually writes the change into the `vehicles`
 * collection (see firestore-vehicles.ts) — nothing takes effect until
 * that happens.
 */

const COLLECTION = "vehicle_reports";

export async function submitVehicleReport(
  vehicleId: string,
  routeId: string,
  label: string,
  updates: Partial<VehicleAttributes>,
  reportedBy = "you",
): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  await addDoc(collection(db, COLLECTION), {
    vehicle_id: vehicleId,
    route_id: routeId,
    label,
    updates,
    status: "pending",
    reported_at: new Date().toISOString(),
    reported_by: reportedBy,
  });
}

/** Live subscription to pending reports only, newest first — for the admin queue. */
export function subscribeToPendingVehicleReports(
  onChange: (reports: VehicleReport[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe | null {
  if (!db) return null;
  // Deliberately no orderBy here — combining where() + orderBy() on a
  // different field requires a Firestore composite index to be created
  // manually in the console first. Sorting client-side avoids that entirely.
  const reportsQuery = query(collection(db, COLLECTION), where("status", "==", "pending"));
  return onSnapshot(
    reportsQuery,
    (snapshot) => {
      const reports = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as VehicleReport)
        .sort((a, b) => b.reported_at.localeCompare(a.reported_at));
      onChange(reports);
    },
    (error) => {
      console.error("[MonFate] Failed to subscribe to vehicle reports:", error);
      onError?.(error);
    },
  );
}

/** Approves a report: writes its updates into the vehicle's Firestore doc,
 * then removes the report from the pending queue. */
export async function approveVehicleReport(report: VehicleReport): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  await applyVehicleAttributeUpdates(report.vehicle_id, report.updates);
  await updateDoc(doc(db, COLLECTION, report.id), { status: "approved" });
  await deleteDoc(doc(db, COLLECTION, report.id));
}

/** Rejects a report without changing the vehicle. */
export async function rejectVehicleReport(reportId: string): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  await updateDoc(doc(db, COLLECTION, reportId), { status: "rejected" });
  await deleteDoc(doc(db, COLLECTION, reportId));
}
