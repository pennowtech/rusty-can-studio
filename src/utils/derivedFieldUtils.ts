import type { CanProfile, SignalDef } from "@/profile-editor/model/profile";

type LegacySignal = SignalDef & { id?: string };
type LegacyFrame = { signals?: Record<string, LegacySignal> | LegacySignal[] };
type DerivedFieldProfile = Pick<CanProfile, "frames"> | { frames: Record<string, LegacyFrame> };

function collectSignals(profile: DerivedFieldProfile) {
  return Object.values(profile.frames).flatMap((frame) => {
    const signals = (frame as LegacyFrame).signals;
    if (!signals) return [];
    return Array.isArray(signals) ? signals : Object.values(signals);
  });
}

export function createDerivedField(profile: DerivedFieldProfile) {
  const id = crypto.randomUUID();

  const allSignals = collectSignals(profile);
  const firstSignal = allSignals[0];

  return {
    id,
    derivedField: {
      id,
      name: "NewDerived",
      source: allSignals.length > 0 ? "signal" : "expression",
      signalId: firstSignal ? firstSignal.id ?? firstSignal.name : undefined,
      expr: allSignals.length === 0 ? "" : undefined,
    },
  };
}
