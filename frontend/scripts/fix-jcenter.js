const fs = require('fs');
const path = require('path');

function fixJcenter(filePath) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('jcenter()')) {
      content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed jcenter() in ${filePath}`);
    }
  }
}

// 1. Fix react-native-thermal-printer build.gradle
const thermalPrinterGradle = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-thermal-printer',
  'android',
  'build.gradle'
);
fixJcenter(thermalPrinterGradle);

// 1b. Fix react-native-external-display build.gradle (remove ndk abiFilters that break 64-bit arm64-v8a devices)
const externalDisplayGradle = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-external-display',
  'android',
  'build.gradle'
);
if (fs.existsSync(externalDisplayGradle)) {
  let edContent = fs.readFileSync(externalDisplayGradle, 'utf8');
  let edChanged = false;
  if (/ndk\s*\{[^}]*abiFilters[^}]*\}/s.test(edContent)) {
    edContent = edContent.replace(/ndk\s*\{[^}]*abiFilters[^}]*\}/gs, '// removed restrictive ndk abiFilters to support arm64-v8a');
    edChanged = true;
  }
  if (edContent.includes("safeExtGet('compileSdkVersion', 28)")) {
    edContent = edContent.replace("safeExtGet('compileSdkVersion', 28)", "safeExtGet('compileSdkVersion', 34)");
    edChanged = true;
  }
  if (edContent.includes("safeExtGet('targetSdkVersion', 28)")) {
    edContent = edContent.replace("safeExtGet('targetSdkVersion', 28)", "safeExtGet('targetSdkVersion', 34)");
    edChanged = true;
  }
  if (edContent.includes("safeExtGet('minSdkVersion', 16)")) {
    edContent = edContent.replace("safeExtGet('minSdkVersion', 16)", "safeExtGet('minSdkVersion', 21)");
    edChanged = true;
  }
  if (edChanged) {
    fs.writeFileSync(externalDisplayGradle, edContent, 'utf8');
    console.log(`✅ Patched react-native-external-display build.gradle for arm64-v8a and modern SDKs`);
  }
}

// 2. Scan node_modules for any other build.gradle files containing jcenter()
function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.bin' && entry.name !== 'android' && entry.name !== '.git') {
        scanDir(fullPath);
      }
    } else if (entry.isFile() && entry.name === 'build.gradle') {
      fixJcenter(fullPath);
    }
  }
}

function fixThermalPrinterModule(filePath) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const oldMethod = `private BluetoothConnection getBluetoothConnectionWithMacAddress(String macAddress) {
    for (BluetoothConnection device : btDevicesList) {
      if (device.getDevice().getAddress().contentEquals(macAddress))
        return device;
    }
    return null;
  }`;

    const newMethod = `private BluetoothConnection getBluetoothConnectionWithMacAddress(String macAddress) {
    if (btDevicesList.isEmpty()) {
      try {
        Set<BluetoothDevice> pairedDevices = BluetoothAdapter.getDefaultAdapter().getBondedDevices();
        if (pairedDevices != null) {
          for (BluetoothDevice device : pairedDevices) {
            btDevicesList.add(new BluetoothConnection(device));
          }
        }
      } catch (Exception e) {}
    }
    for (BluetoothConnection device : btDevicesList) {
      if (device.getDevice().getAddress().equalsIgnoreCase(macAddress))
        return device;
    }
    try {
      BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
      if (adapter != null) {
        BluetoothDevice device = adapter.getRemoteDevice(macAddress);
        if (device != null) {
          return new BluetoothConnection(device);
        }
      }
    } catch (Exception e) {}
    return null;
  }`;

    if (content.includes('contentEquals(macAddress)')) {
      content = content.replace(oldMethod, newMethod);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Patched getBluetoothConnectionWithMacAddress in ${filePath}`);
    }
  }
}

const thermalPrinterJava = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-thermal-printer',
  'android',
  'src',
  'main',
  'java',
  'com',
  'reactnativethermalprinter',
  'ThermalPrinterModule.java'
);
fixThermalPrinterModule(thermalPrinterJava);

try {
  const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
  scanDir(nodeModulesDir);
} catch (e) {
  console.warn('Scan node_modules warn:', e.message);
}
