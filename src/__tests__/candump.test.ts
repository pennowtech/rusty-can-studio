import { describe, expect, it } from "vitest";

import { parseCandump } from "@/can/candump";

describe("parseCandump", () => {
  it("parses classic CAN candump rows with timestamps and line numbers", () => {
    const frames = parseCandump(`
 (000.500017)  can1  14089C01  [06]  01 01 07 00 00 00
ignored line
 (001.843124)  can1  0E005C01  [02]  C1 01
`);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      ts_ms: 500,
      iface: "can1",
      dir: "rx",
      id: 0x14089c01,
      is_fd: false,
      data_hex: "010107000000",
      line_no: 2,
    });
    expect(frames[1]).toMatchObject({
      ts_ms: 1843,
      id: 0x0e005c01,
      data_hex: "c101",
      line_no: 4,
    });
  });

  it("marks payloads longer than eight bytes as CAN-FD", () => {
    const frames = parseCandump("(001.000000) can0 18DA10F1 [12] 00 01 02 03 04 05 06 07 08 09 0A 0B");

    expect(frames).toHaveLength(1);
    expect(frames[0].is_fd).toBe(true);
    expect(frames[0].data_hex).toBe("000102030405060708090a0b");
  });
});
