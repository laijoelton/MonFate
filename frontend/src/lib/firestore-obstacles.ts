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

const COLLECTION = "obstacles";

export function subscribeToObstacles(
  onChange: (obstacles: ObstacleReport[]) => void,
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
    },
  );
}

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