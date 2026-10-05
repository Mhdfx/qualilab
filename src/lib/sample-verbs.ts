import type { Role, SampleStatus } from "@/generated/prisma/enums";
import { CORRECTABLE_STATUSES, canTransition } from "./sample-status";

/**
 * Which correction verbs a role may use on a line: pure, so a Server
 * Component (the programme sheet) can decide what to render without
 * importing the client-side `SampleVerbs` module — calling a function of a
 * "use client" module from the server throws at runtime, not at build time.
 */
export function verbsFor(sample: { status: SampleStatus }, role: Role) {
  const correct = CORRECTABLE_STATUSES.includes(sample.status) && ["RECEPTIONNISTE", "VALIDATEUR", "ADMIN"].includes(role);
  const cancel = canTransition(sample.status, "ANNULE", role).ok;
  const reactivate = sample.status === "ANNULE" && role === "ADMIN";
  return { correct, cancel, reactivate };
}
