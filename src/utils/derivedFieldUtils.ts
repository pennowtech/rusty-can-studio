import { ProfileModel } from "@/model/profile";

export function createDerivedField(profile: ProfileModel) {
  const id = crypto.randomUUID();

  // Collect all signals safely
  const allSignals = Object.values(profile.frames).flatMap((f) => Object.values(f.signals));

  return {
    id,
    derivedField: {
      id,
      name: "NewDerived",
      source: allSignals.length > 0 ? "signal" : "expression",
      signalId: allSignals.length > 0 ? allSignals[0].id : undefined,
      expr: allSignals.length === 0 ? "" : undefined,
    },
  };
}
