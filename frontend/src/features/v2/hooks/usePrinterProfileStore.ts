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

const BUILT_IN_IDS = new Set(BUILT_IN_PROFILES.map((p) => p.id));

export function isBuiltIn(id: string): boolean {
  return BUILT_IN_IDS.has(id);
}

interface PrinterProfileState {
  /** 사용자 정의 프로파일 (localStorage 영속). */
  userProfiles: PrinterProfileV2[];
  currentId: string;
  setCurrent: (id: string) => void;
  addProfile: (p: Omit<PrinterProfileV2, "id">) => string;
  updateProfile: (id: string, patch: Partial<PrinterProfileV2>) => void;
  removeProfile: (id: string) => void;
}

export const usePrinterProfileStore = create<PrinterProfileState>()(
  persist(
    (set) => ({
      userProfiles: [],
      currentId: BUILT_IN_PROFILES[0].id,

      setCurrent: (id) => set({ currentId: id }),

      addProfile: (p) => {
        const id = `user-${crypto.randomUUID()}`;
        const newP: PrinterProfileV2 = { id, ...p };
        set((s) => ({ userProfiles: [...s.userProfiles, newP] }));
        return id;
      },

      updateProfile: (id, patch) =>
        set((s) => ({
          userProfiles: s.userProfiles.map((p) =>
            p.id === id ? { ...p, ...patch, id: p.id } : p,
          ),
        })),

      removeProfile: (id) =>
        set((s) => {
          const nextUser = s.userProfiles.filter((p) => p.id !== id);
          const stillExists =
            BUILT_IN_IDS.has(s.currentId) ||
            nextUser.some((p) => p.id === s.currentId);
          return {
            userProfiles: nextUser,
            currentId: stillExists ? s.currentId : BUILT_IN_PROFILES[0].id,
          };
        }),
    }),
    {
      name: "v2_printer_profile",
      partialize: (s) => ({
        userProfiles: s.userProfiles,
        currentId: s.currentId,
      }),
    },
  ),
);

/** 빌트인 + 사용자 프로파일 합산. */
export function useAllProfiles(): PrinterProfileV2[] {
  const userProfiles = usePrinterProfileStore((s) => s.userProfiles);
  return [...BUILT_IN_PROFILES, ...userProfiles];
}

export function useCurrentProfile(): PrinterProfileV2 {
  const all = useAllProfiles();
  const currentId = usePrinterProfileStore((s) => s.currentId);
  return all.find((p) => p.id === currentId) ?? BUILT_IN_PROFILES[0];
}
