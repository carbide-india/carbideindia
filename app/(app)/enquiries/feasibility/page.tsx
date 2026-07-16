import { redirect } from "next/navigation";
import type { Route } from "next";

// Primary Feasibility moved to its own Hub module. Preserve old links.
export default function LegacyFeasibilityQueueRedirect() {
  redirect("/feasibility" as Route);
}
