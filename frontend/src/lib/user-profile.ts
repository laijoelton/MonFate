import { useEffect, useState } from "react";
import type { NeedType } from "@/types/monfate";

const STORAGE_KEY = "monfate:citizen-needs";

function readStoredNeeds(): NeedType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NeedType[]) : [];
  } catch {
    return [];
  }
}

/**
 * A citizen's saved accessibility needs (ramp, wheelchair space, priority
 * seat) — persisted in localStorage, not Firestore, since this is a
 * per-device preference, not something the admin dashboard needs to see
 * directly. It's used to prefill the per-trip needs picker.
 */
export function useUserProfile() {
  const [needs, setNeeds] = useState<NeedType[]>([]);

  useEffect(() => {
    setNeeds(readStoredNeeds());
  }, []);

  const toggleNeed = (need: NeedType) => {
    setNeeds((prev) => {
      const next = prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { needs, toggleNeed };
}

export const NEED_LABELS: Record<NeedType, string> = {
  ramp: "Wheelchair ramp",
  wheelchair_space: "Wheelchair space",
  priority_seat: "Priority seating",
};
