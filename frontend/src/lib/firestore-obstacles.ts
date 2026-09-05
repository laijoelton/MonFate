import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ObstacleReport } from "@/types/monfate";
import type { ObstacleDraft } from "@/components/ObstacleReportModal";

/**
 * Firestore-backed obstacle reports. Collection shape mirrors the
 * `ObstacleReport` contract in types/monfate.ts exactly (minus `id`, which
 * is the Firestore document id) — see AGENTS.md guardrail #4 on keeping
 * contracts and their implementations in sync.
 */

const COLLECTION = "obstacles";

/**
 * Subscribes to live obstacle reports, newest first. Returns null if
 * Firebase isn't configured — callers should keep using mock data in that
 * case rather than treating it as an error.
 */
export function subscribeToObstacles(
  onChange: (obstacles: ObstacleReport[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe | null {
  if (!db) return null;

  const obstaclesQuery = query(collection(db, COLLECTION), orderBy("reported_at", "desc"));

  return onSnapshot(
    obstaclesQuery,
    (snapshot) => {
      const obstacles = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as ObstacleReport,
      );
      onChange(obstacles);
    },
    (error) => {
      console.error("[MonFate] Failed to subscribe to obstacles:", error);
      onError?.(error);
    },
  );
}

/** Writes a new obstacle report to Firestore. Throws if Firebase isn't configured. */
export async function addObstacleReport(
  draft: ObstacleDraft,
  location: { lat: number; lng: number },
  reportedBy = "you",
): Promise<void> {
  if (!db) {
    throw new Error("Firebase is not configured — check frontend/.env.local");
  }
  const nowIso = new Date().toISOString();
  await addDoc(collection(db, COLLECTION), {
    obstacle_type: draft.obstacle_type,
    location,
    description: draft.description,
    affects: draft.affects,
    status: "active",
    trust_score: 40,
    verification_count: 1,
    reported_at: nowIso,
    last_verified_at: nowIso,
    reported_by: reportedBy,
  });
}
