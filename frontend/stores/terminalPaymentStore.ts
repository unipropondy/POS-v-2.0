import { create } from "zustand";

export type TerminalSessionStatus =
  | "idle"
  | "processing"
  | "success"
  | "cancelled"
  | "failed";

export interface TerminalSession {
  tableId: string;
  status: TerminalSessionStatus;
  message: string;
  method: string;
  total: number;
  /** Row ID for split payment sessions */
  splitRowId?: string;
  /** Callback fired when the background promise resolves */
  onUpdate?: (
    status: TerminalSessionStatus,
    message: string,
    result: any,
    error: any
  ) => void;
}

interface TerminalPaymentState {
  sessions: Record<string, TerminalSession>;
  setSession: (tableId: string, session: TerminalSession) => void;
  updateSession: (tableId: string, patch: Partial<TerminalSession>) => void;
  clearSession: (tableId: string) => void;
  getSession: (tableId: string) => TerminalSession | undefined;
}

export const useTerminalPaymentStore = create<TerminalPaymentState>(
  (set, get) => ({
    sessions: {},

    setSession: (tableId, session) =>
      set((state) => ({
        sessions: { ...state.sessions, [tableId]: session },
      })),

    updateSession: (tableId, patch) =>
      set((state) => {
        const existing = state.sessions[tableId];
        if (!existing) return state;
        return {
          sessions: {
            ...state.sessions,
            [tableId]: { ...existing, ...patch },
          },
        };
      }),

    clearSession: (tableId) =>
      set((state) => {
        const next = { ...state.sessions };
        delete next[tableId];
        return { sessions: next };
      }),

    getSession: (tableId) => get().sessions[tableId],
  })
);
