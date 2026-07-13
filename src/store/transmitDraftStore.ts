import { create } from "zustand";

import type { WsFrame } from "@/can-bridge/ws/types";

function formatCanId(id: number) {
  return id.toString(16).toUpperCase().padStart(id > 0x7ff ? 8 : 3, "0");
}

function byteLength(dataHex: string) {
  return Math.floor(dataHex.replace(/[^0-9a-fA-F]/g, "").length / 2);
}

function formatPayloadBytes(dataHex: string) {
  const cleaned = dataHex.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return cleaned.match(/.{1,2}/g)?.join(" ") ?? "";
}

export type TransmitDraft = {
  canId: string;
  payload: string;
  dlc: string;
  isFd: boolean;
  brs: boolean;
  source?: string;
};

type TransmitDraftState = {
  draft?: TransmitDraft;
  setDraft: (draft: TransmitDraft) => void;
  stageFrame: (frame: WsFrame, source?: string) => void;
  clearDraft: () => void;
};

export const useTransmitDraftStore = create<TransmitDraftState>((set) => ({
  setDraft: (draft) => set({ draft }),
  stageFrame: (frame, source = "CAN Monitor") =>
    set({
      draft: {
        canId: formatCanId(frame.id),
        payload: formatPayloadBytes(frame.data_hex),
        dlc: String(byteLength(frame.data_hex)),
        isFd: frame.is_fd,
        brs: frame.is_fd,
        source,
      },
    }),
  clearDraft: () => set({ draft: undefined }),
}));
