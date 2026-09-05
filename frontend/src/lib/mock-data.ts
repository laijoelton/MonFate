import type { AccessibilityFeature } from "@/types/monfate";

/**
 * The cockpit now reads live data from backend_api, so the former mock
 * obstacle/vehicle fixtures are gone. This is the one piece of static
 * configuration left: which accessibility needs a rider can filter on.
 */
export const ACCESSIBILITY_FILTERS: AccessibilityFeature[] = [
  "wheelchair_ramp",
  "tactile_paving",
  "working_elevator",
  "stroller_friendly",
];
