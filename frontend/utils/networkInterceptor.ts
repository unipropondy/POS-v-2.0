import { API_URL } from "@/constants/Config";
import { useAuthStore } from "@/stores/authStore";

// Store original fetch reference once
const originalFetch = globalThis.fetch;

/**
 * Universal Network Interceptor:
 * Automatically injects Authorization (JWT) and X-Company-Code headers
 * into all outgoing fetch requests destined for the POS backend API.
 * This guarantees that every module (Dishes, Tables, Sales Reports, Settlements,
 * Orders, Dashboards, Settings) communicates with the company database established at login.
 */
export function installNetworkInterceptor() {
  if ((globalThis as any).__pos_network_interceptor_installed) {
    return;
  }
  (globalThis as any).__pos_network_interceptor_installed = true;

  console.log("🌐 [NetworkInterceptor] Installed universal API tenant context injector");

  const customFetch = async function (this: any, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      const urlString =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      const isApiRequest =
        urlString.includes("/api/") ||
        urlString.startsWith("/api") ||
        (Boolean(API_URL) && urlString.startsWith(API_URL));

      if (isApiRequest) {
        const authState = useAuthStore.getState();
        const token = authState?.token;
        const companyCode = authState?.user?.companyCode;

        // Build flat Headers dictionary for maximum cross-platform compatibility
        const headersMap: Record<string, string> = {};

        if (init?.headers instanceof Headers) {
          init.headers.forEach((val, key) => {
            headersMap[key] = val;
          });
        } else if (Array.isArray(init?.headers)) {
          init.headers.forEach(([k, v]) => {
            headersMap[k] = v;
          });
        } else if (init?.headers && typeof init.headers === "object") {
          Object.assign(headersMap, init.headers);
        } else if (typeof input === "object" && !(input instanceof URL) && (input as Request).headers) {
          (input as Request).headers.forEach((val, key) => {
            headersMap[key] = val;
          });
        }

        const hasAuth = Object.keys(headersMap).some(k => k.toLowerCase() === "authorization");
        if (token && !hasAuth) {
          headersMap["Authorization"] = `Bearer ${token}`;
        }

        const hasCompany = Object.keys(headersMap).some(k => k.toLowerCase() === "x-company-code");
        if (companyCode && !hasCompany) {
          headersMap["X-Company-Code"] = String(companyCode).trim();
        }

        const newInit: RequestInit = {
          ...init,
          headers: headersMap,
        };

        return originalFetch.call(this, input as any, newInit);
      }
    } catch (err) {
      console.warn("⚠️ [NetworkInterceptor] Error applying tenant headers:", err);
    }

    return originalFetch.call(this, input as any, init);
  };

  globalThis.fetch = customFetch;
  if (typeof window !== "undefined") {
    window.fetch = customFetch;
  }
}

