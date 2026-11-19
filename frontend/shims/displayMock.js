const reactNative = require("react-native");

// Only mock on Web environment where native display and printer modules do not exist.
// NEVER monkey-patch NativeModules or TurboModuleRegistry on Native Android/iOS,
// as doing so in React Native 0.86+ Bridgeless mode intercepts C++ TurboModules
// and causes immediate fatal unhandled C++/JS exceptions on app startup.
if (reactNative && reactNative.Platform && reactNative.Platform.OS === "web") {
  const mockDisplayModule = {
    init: () => {},
    getInitialScreens: () => ({ SCREEN_INFO: {} }),
    SCREEN_INFO: {},
    requestScene: () => false,
    closeScene: () => false,
    isMainSceneActive: () => true,
    resumeMainScene: () => true,
    addListener: () => {},
    removeListeners: () => {},
  };

  const mockThermalPrinter = {
    printTcp: async () => {},
    printBluetooth: async () => {},
    printUsb: async () => {},
    getBluetoothDeviceList: async () => [],
  };

  if (reactNative.NativeModules) {
    try {
      reactNative.NativeModules.RNExternalDisplayEvent = mockDisplayModule;
      reactNative.NativeModules.ThermalPrinter = mockThermalPrinter;
    } catch (e) {
      // Ignored on web
    }
  }

  if (reactNative.TurboModuleRegistry && typeof reactNative.TurboModuleRegistry.get === "function") {
    try {
      const originalGet = reactNative.TurboModuleRegistry.get;
      reactNative.TurboModuleRegistry.get = (name) => {
        if (name === "RNExternalDisplayEvent") return mockDisplayModule;
        if (name === "ThermalPrinter") return mockThermalPrinter;
        return originalGet(name);
      };
    } catch (e) {
      // Ignored on web
    }
  }
}

