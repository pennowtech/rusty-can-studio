import { bench, describe } from "vitest";

import { parseCandump } from "@/can/candump";

function buildCandump(frameCount: number) {
  const lines: string[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const timestamp = (index * 0.001).toFixed(6).padStart(10, "0");
    const canId = index % 2 === 0 ? "18203C01" : "14089C01";
    const payload = index % 2 === 0 ? "01 01" : "01 01 07 00 00 00";
    const dlc = index % 2 === 0 ? "02" : "06";
    lines.push(` (${timestamp})  can1  ${canId}  [${dlc}]  ${payload}`);
  }
  return lines.join("\n");
}

describe("candump parsing performance", () => {
  const mediumTrace = buildCandump(10_000);
  const largeTrace = buildCandump(50_000);

  bench("parse 10k candump frames", () => {
    parseCandump(mediumTrace);
  });

  bench("parse 50k candump frames", () => {
    parseCandump(largeTrace);
  });
});
