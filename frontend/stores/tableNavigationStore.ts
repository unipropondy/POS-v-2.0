import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

type TableNavState = {
  // maps tableId -> lastScreen (e.g. 'summary' or 'payment')
  tableScreens: Record<string, string>;
  setTableLastScreen: (tableId: string, screen: string) => void;
  clearTableLastScreen: (tableId: string) => void;
};

export const useTableNavigationStore = create<TableNavState>()(
  persist(
    (set) => ({
      tableScreens: {},
      setTableLastScreen: (tableId, screen) =>
        set((state) => ({
          tableScreens: {
            ...state.tableScreens,
            [tableId]: screen,
          },
        })),
      clearTableLastScreen: (tableId) =>
        set((state) => {
          const next = { ...state.tableScreens };
          delete next[tableId];
          return { tableScreens: next };
        }),
    }),
    {
      name: "table-navigation-storage",
      storage: createJSONStorage(() =>
        Platform.OS === "web" ? window.localStorage : AsyncStorage
      ),
    }
  )
);
