import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../constants/Config";

export interface GeneralSettings {
  enableKOT: boolean;
  enableKDS: boolean;
  enableCheckoutBill: boolean;
  enableCheckoutFlow: boolean;
  enableDirectProcessToPay: boolean;
  customerSideDisplay: boolean;
  enableGuestDetailsPopup: boolean;
  enableCashDrawer: boolean;
  SVCIdentification: boolean;
  enableKDSPrint: boolean;
  enableCombo: boolean;
  showLoyalty: boolean;
  showRewardPoints: boolean;
  showPromoCode: boolean;
  enableOnlinePayment: boolean;
  enableQROrderAutoPrint: boolean;
  enableComboPrint: boolean;
  enableRequestService: boolean;
  enableCookingInstructions: boolean;
}

interface GeneralSettingsState {
  settings: GeneralSettings;
  loading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<GeneralSettings>) => Promise<boolean>;
}

export const useGeneralSettingsStore = create<GeneralSettingsState>()(
  persist(
    (set, get) => ({
      settings: {
        enableKOT: true,
        enableKDS: true,
        enableCheckoutBill: true,
        enableCheckoutFlow: true,
        enableDirectProcessToPay: false,
        customerSideDisplay: true,
        enableGuestDetailsPopup: true,
        enableCashDrawer: true,
        SVCIdentification: true,
        enableKDSPrint: true,
        enableCombo: true,
        showLoyalty: true,
        showRewardPoints: true,
        showPromoCode: true,
        enableOnlinePayment: true,
        enableQROrderAutoPrint: true,
        enableComboPrint: false,
        enableRequestService: true,
        enableCookingInstructions: true,
      },
      loading: false,

      fetchSettings: async () => {
        set({ loading: true });
        try {
          const response = await fetch(`${API_URL}/api/settings`);
          const data = await response.json();
          
          if (data) {
            set((state) => ({
              settings: {
                ...state.settings,
                enableKOT: data.EnableKOT !== undefined ? Boolean(data.EnableKOT) : true,
                enableKDS: data.EnableKDS !== undefined ? Boolean(data.EnableKDS) : true,
                enableCheckoutBill: data.EnableCheckoutBill !== undefined ? Boolean(data.EnableCheckoutBill) : true,
                enableCheckoutFlow: data.EnableCheckoutFlow !== undefined ? Boolean(data.EnableCheckoutFlow) : true,
                enableDirectProcessToPay: data.EnableDirectProcessToPay !== undefined ? Boolean(data.EnableDirectProcessToPay) : false,
                customerSideDisplay: data.CustomerSideDisplay !== undefined ? Boolean(data.CustomerSideDisplay) : true,
                enableGuestDetailsPopup: data.EnableGuestDetailsPopup !== undefined ? Boolean(data.EnableGuestDetailsPopup) : true,
                enableCashDrawer: data.EnableCashDrawer !== undefined ? Boolean(data.EnableCashDrawer) : true,
                SVCIdentification: data.SVCIdentification !== undefined ? Boolean(data.SVCIdentification) : true,
                enableKDSPrint: data.EnableKDSPrint !== undefined ? Boolean(data.EnableKDSPrint) : true,
                enableCombo: data.EnableCombo !== undefined ? Boolean(data.EnableCombo) : true,
                showLoyalty: data.ShowLoyalty !== undefined ? Boolean(data.ShowLoyalty) : true,
                showRewardPoints: data.ShowRewardPoints !== undefined ? Boolean(data.ShowRewardPoints) : true,
                showPromoCode: data.ShowPromoCode !== undefined ? Boolean(data.ShowPromoCode) : true,
                enableOnlinePayment: data.EnableOnlinePayment !== undefined ? Boolean(data.EnableOnlinePayment) : true,
                enableQROrderAutoPrint: data.EnableQROrderAutoPrint !== undefined ? Boolean(data.EnableQROrderAutoPrint) : true,
                enableComboPrint: data.EnableComboPrint !== undefined ? Boolean(data.EnableComboPrint) : false,
                enableRequestService: data.EnableRequestService !== undefined ? Boolean(data.EnableRequestService) : true,
                enableCookingInstructions: data.EnableCookingInstructions !== undefined ? Boolean(data.EnableCookingInstructions) : true,
              },
            }));
          }
        } catch (error) {
          console.error("❌ [GeneralSettingsStore] Fetch Error:", error);
        } finally {
          set({ loading: false });
        }
      },

      updateSettings: async (newSettings) => {
        const previousSettings = get().settings;
        const updatedSettings = { ...previousSettings, ...newSettings };
        
        // Optimistic UI update
        set({ settings: updatedSettings, loading: true });

        try {
          // Fetch existing payment settings so we don't overwrite them with null in the API call
          const getRes = await fetch(`${API_URL}/api/settings`);
          const currentData = await getRes.json();
          
          const payload = {
            upiId: currentData.UPI_ID,
            shopName: currentData.ShopName,
            qrCodeUrl: currentData.PayNow_QR_Url,
            enableKOT: updatedSettings.enableKOT,
            enableKDS: updatedSettings.enableKDS,
            enableCheckoutBill: updatedSettings.enableCheckoutBill,
            enableCheckoutFlow: updatedSettings.enableCheckoutFlow,
            enableDirectProcessToPay: updatedSettings.enableDirectProcessToPay,
            customerSideDisplay: updatedSettings.customerSideDisplay,
            enableGuestDetailsPopup: updatedSettings.enableGuestDetailsPopup,
            enableCashDrawer: updatedSettings.enableCashDrawer,
            SVCIdentification: updatedSettings.SVCIdentification,
            enableKDSPrint: updatedSettings.enableKDSPrint,
            enableCombo: updatedSettings.enableCombo,
            showLoyalty: updatedSettings.showLoyalty,
            showRewardPoints: updatedSettings.showRewardPoints,
            showPromoCode: updatedSettings.showPromoCode,
            enableOnlinePayment: updatedSettings.enableOnlinePayment,
            enableQROrderAutoPrint: updatedSettings.enableQROrderAutoPrint,
            enableComboPrint: updatedSettings.enableComboPrint,
            enableRequestService: updatedSettings.enableRequestService,
            enableCookingInstructions: updatedSettings.enableCookingInstructions,
          };

          const res = await fetch(`${API_URL}/api/settings/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!res.ok) throw new Error("Failed to update settings");
          
          set({ loading: false });
          return true;
        } catch (error) {
          console.error("❌ [GeneralSettingsStore] Update Error:", error);
          // Revert on failure
          set({ settings: previousSettings, loading: false });
          return false;
        }
      },
    }),
    {
      name: "general-settings-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
