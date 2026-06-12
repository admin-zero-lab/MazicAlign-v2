import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PrinterProfileV2 } from "../types/printer";

export const BUILT_IN_PROFILES: PrinterProfileV2[] = [
  {
    id: "elegoo-mars-3-pro",
    name: "ELEGOO Mars 3 Pro",
    lcdWidthPx: 4098,
    lcdHeightPx: 2560,
    pixelPitchUm: 35.0,
    buildVolumeMm: [143.43, 89.6, 175.0],
  },
  {
    id: "elegoo-saturn-2",
    name: "ELEGOO Saturn 2",
    lcdWidthPx: 7680,
    lcdHeightPx: 4320,
    pixelPitchUm: 28.5,
    buildVolumeMm: [218.88, 123.12, 250.0],
  },
  {
    id: "phrozen-sonic-mighty-8k",
    name: "Phrozen Sonic Mighty 8K",
    lcdWidthPx: 7680,
    lcdHeightPx: 4320,
    pixelPitchUm: 28.0,
    buildVolumeMm: [218.88, 123.0, 235.0],
  },
];

interface PrinterProfileState {
  /** 사용 가능한 프로파일 (빌트인 + 사용자 추가 — 일단 빌트인만). */
  profiles: PrinterProfileV2[];
  currentId: string;
  setCurrent: (id: string) => void;
}

export const usePrinterProfileStore = create<PrinterProfileState>()(
  persist(
    (set) => ({
      profiles: BUILT_IN_PROFILES,
      currentId: BUILT_IN_PROFILES[0].id,
      setCurrent: (id) => set({ currentId: id }),
    }),
    {
      name: "v2_printer_profile",
      partialize: (s) => ({ currentId: s.currentId }),
    },
  ),
);

export function useCurrentProfile(): PrinterProfileV2 {
  const profiles = usePrinterProfileStore((s) => s.profiles);
  const currentId = usePrinterProfileStore((s) => s.currentId);
  return (
    profiles.find((p) => p.id === currentId) ?? BUILT_IN_PROFILES[0]
  );
}
