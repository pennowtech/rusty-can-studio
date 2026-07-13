import { bench, describe } from "vitest";

import type { CanProfile } from "@/profile-editor/model/profile";
import { createDerivedField } from "@/utils/derivedFieldUtils";

function buildProfile(frameCount: number, signalsPerFrame: number): CanProfile {
  const frames: CanProfile["frames"] = {};

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const signals: CanProfile["frames"][string]["signals"] = [];
    for (let signalIndex = 0; signalIndex < signalsPerFrame; signalIndex += 1) {
      const id = `signal_${frameIndex}_${signalIndex}`;
      signals.push({
        name: id,
        startByte: signalIndex,
        length: 1,
        factor: 1,
        offset: 0,
      });
    }

    const frameId = `0x${(0x100 + frameIndex).toString(16)}`;
    frames[frameId] = {
      canIdLayout: frameId,
      signals,
    };
  }

  return {
    meta: { name: "Benchmark", version: "1.0.0" },
    frames,
    derivedFields: [],
    columns: [],
    canIdLayouts: {},
    fieldTypes: {},
  };
}

describe("derived field creation performance", () => {
  const profile = buildProfile(1_000, 16);

  bench("create derived field from 16k available signals", () => {
    createDerivedField(profile);
  });
});
