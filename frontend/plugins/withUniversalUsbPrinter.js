const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to inject native Android USB Host printer module
 * into managed prebuild during EAS Build.
 */
function withUniversalUsbPrinter(config) {
  // 1. Ensure uses-feature usb.host in AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }
    const hasUsbFeature = manifest['uses-feature'].some(
      (f) => f.$['android:name'] === 'android.hardware.usb.host'
    );
    if (!hasUsbFeature) {
      manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.usb.host',
          'android:required': 'false',
        },
      });
    }
    return config;
  });

  // 2. Inject UniversalPrinterModule.kt, UniversalPrinterPackage.kt, and register in MainApplication.kt
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const javaDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'unipro',
        'smart_cafe'
      );

      if (!fs.existsSync(javaDir)) {
        fs.mkdirSync(javaDir, { recursive: true });
      }

      // UniversalPrinterModule.kt source
      const moduleContent = `package com.unipro.smart_cafe

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.net.InetSocketAddress
import java.net.Socket

class UniversalPrinterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val ACTION_USB_PERMISSION = "com.unipro.smart_cafe.USB_PERMISSION"

    override fun getName(): String {
        return "UniversalPrinterModule"
    }

    private fun getUsbManager(): UsbManager {
        return reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
    }

    @ReactMethod
    fun listUsbPrinters(promise: Promise) {
        try {
            val usbManager = getUsbManager()
            val deviceList: HashMap<String, UsbDevice>? = usbManager.deviceList
            val resultArray: WritableArray = Arguments.createArray()

            if (deviceList != null) {
                for ((_, device) in deviceList) {
                    val map: WritableMap = Arguments.createMap()
                    map.putInt("deviceId", device.deviceId)
                    map.putInt("vendorId", device.vendorId)
                    map.putInt("productId", device.productId)
                    map.putString("deviceName", device.deviceName)

                    val productName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        device.productName ?: device.deviceName
                    } else {
                        device.deviceName
                    }
                    map.putString("productName", productName)

                    val hasPerm = usbManager.hasPermission(device)
                    map.putBoolean("hasPermission", hasPerm)

                    var isPrinter = device.deviceClass == UsbConstants.USB_CLASS_PRINTER
                    for (i in 0 until device.interfaceCount) {
                        val intf = device.getInterface(i)
                        if (intf.interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
                            isPrinter = true
                            break
                        }
                    }
                    map.putBoolean("isPrinter", isPrinter)

                    resultArray.pushMap(map)
                }
            }

            promise.resolve(resultArray)
        } catch (e: Exception) {
            promise.reject("ERR_USB_LIST", e.message, e)
        }
    }

    @ReactMethod
    fun requestUsbPermission(deviceId: Double, promise: Promise) {
        try {
            val targetId = deviceId.toInt()
            val usbManager = getUsbManager()
            val deviceList = usbManager.deviceList
            var targetDevice: UsbDevice? = null

            if (deviceList != null) {
                for ((_, device) in deviceList) {
                    if (device.deviceId == targetId) {
                        targetDevice = device
                        break
                    }
                }
            }

            if (targetDevice == null) {
                promise.reject("ERR_DEVICE_NOT_FOUND", "USB device $targetId not found")
                return
            }

            if (usbManager.hasPermission(targetDevice)) {
                promise.resolve(true)
                return
            }

            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }

            val permissionIntent = PendingIntent.getBroadcast(
                reactContext,
                0,
                Intent(ACTION_USB_PERMISSION),
                flags
            )

            val filter = IntentFilter(ACTION_USB_PERMISSION)
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    if (ACTION_USB_PERMISSION == intent?.action) {
                        synchronized(this) {
                            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                            try {
                                reactContext.unregisterReceiver(this)
                            } catch (_: Exception) {}

                            promise.resolve(granted)
                        }
                    }
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                reactContext.registerReceiver(receiver, filter)
            }

            usbManager.requestPermission(targetDevice, permissionIntent)
        } catch (e: Exception) {
            promise.reject("ERR_PERMISSION_REQUEST", e.message, e)
        }
    }

    @ReactMethod
    fun connectUsb(deviceId: Double, promise: Promise) {
        try {
            val targetId = deviceId.toInt()
            val usbManager = getUsbManager()
            val deviceList = usbManager.deviceList
            var targetDevice: UsbDevice? = null

            if (deviceList != null) {
                for ((_, device) in deviceList) {
                    if (device.deviceId == targetId) {
                        targetDevice = device
                        break
                    }
                }
            }

            if (targetDevice == null) {
                promise.reject("ERR_DEVICE_NOT_FOUND", "USB device $targetId not found")
                return
            }

            val map: WritableMap = Arguments.createMap()
            map.putInt("deviceId", targetDevice.deviceId)
            map.putInt("vendorId", targetDevice.vendorId)
            map.putInt("productId", targetDevice.productId)
            map.putString("deviceName", targetDevice.deviceName)
            map.putString("productName", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) targetDevice.productName ?: targetDevice.deviceName else targetDevice.deviceName)
            map.putBoolean("connected", true)

            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERR_USB_CONNECT", e.message, e)
        }
    }

    @ReactMethod
    fun getUsbStatus(promise: Promise) {
        try {
            val usbManager = getUsbManager()
            val deviceList = usbManager.deviceList
            var connected = false
            var firstPrinter: UsbDevice? = null

            if (deviceList != null) {
                for ((_, device) in deviceList) {
                    var isPrinter = device.deviceClass == UsbConstants.USB_CLASS_PRINTER
                    for (i in 0 until device.interfaceCount) {
                        if (device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
                            isPrinter = true
                            break
                        }
                    }
                    if (isPrinter || device.deviceName.contains("printer", ignoreCase = true)) {
                        connected = true
                        firstPrinter = device
                        break
                    }
                }
            }

            val map: WritableMap = Arguments.createMap()
            map.putBoolean("connected", connected)
            if (firstPrinter != null) {
                map.putInt("deviceId", firstPrinter.deviceId)
                map.putInt("vendorId", firstPrinter.vendorId)
                map.putInt("productId", firstPrinter.productId)
                map.putString("productName", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) firstPrinter.productName ?: firstPrinter.deviceName else firstPrinter.deviceName)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERR_USB_STATUS", e.message, e)
        }
    }

    @ReactMethod
    fun printUsbRaw(base64Data: String, promise: Promise) {
        Thread {
            var connection: UsbDeviceConnection? = null
            var usbInterface: UsbInterface? = null
            try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val usbManager = getUsbManager()
                val deviceList = usbManager.deviceList

                if (deviceList == null || deviceList.isEmpty()) {
                    promise.reject("ERR_NO_USB", "No USB devices connected")
                    return@Thread
                }

                var targetDevice: UsbDevice? = null
                var outEndpoint: UsbEndpoint? = null

                for ((_, device) in deviceList) {
                    for (i in 0 until device.interfaceCount) {
                        val intf = device.getInterface(i)
                        for (j in 0 until intf.endpointCount) {
                            val ep = intf.getEndpoint(j)
                            if (ep.direction == UsbConstants.USB_DIR_OUT) {
                                targetDevice = device
                                usbInterface = intf
                                outEndpoint = ep
                                break
                            }
                        }
                        if (outEndpoint != null) break
                    }
                    if (outEndpoint != null) break
                }

                if (targetDevice == null || usbInterface == null || outEndpoint == null) {
                    promise.reject("ERR_NO_PRINTER_ENDPOINT", "No USB OUT endpoint found for printing")
                    return@Thread
                }

                if (!usbManager.hasPermission(targetDevice)) {
                    promise.reject("ERR_NO_PERMISSION", "USB permission not granted for device")
                    return@Thread
                }

                connection = usbManager.openDevice(targetDevice)
                if (connection == null) {
                    promise.reject("ERR_OPEN_FAILED", "Failed to open USB device connection")
                    return@Thread
                }

                if (!connection.claimInterface(usbInterface, true)) {
                    promise.reject("ERR_CLAIM_FAILED", "Failed to claim USB interface")
                    return@Thread
                }

                val chunkSize = 4096
                var offset = 0
                while (offset < bytes.size) {
                    val length = Math.min(chunkSize, bytes.size - offset)
                    val chunk = ByteArray(length)
                    System.arraycopy(bytes, offset, chunk, 0, length)
                    val transferred = connection.bulkTransfer(outEndpoint, chunk, length, 5000)
                    if (transferred < 0) {
                        promise.reject("ERR_TRANSFER", "USB bulkTransfer failed with status $transferred")
                        return@Thread
                    }
                    offset += length
                }

                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERR_PRINT_USB", e.message, e)
            } finally {
                try {
                    usbInterface?.let { connection?.releaseInterface(it) }
                    connection?.close()
                } catch (_: Exception) {}
            }
        }.start()
    }

    @ReactMethod
    fun testLanConnection(ip: String, port: Double, timeoutMs: Double, promise: Promise) {
        Thread {
            try {
                val socket = Socket()
                val targetPort = port.toInt()
                val targetTimeout = timeoutMs.toInt()
                socket.connect(InetSocketAddress(ip, targetPort), targetTimeout)
                socket.close()

                val map: WritableMap = Arguments.createMap()
                map.putBoolean("success", true)
                map.putString("message", "Connected successfully to $ip:$targetPort")
                promise.resolve(map)
            } catch (e: Exception) {
                val map: WritableMap = Arguments.createMap()
                map.putBoolean("success", false)
                map.putString("message", e.message ?: "Connection failed")
                promise.resolve(map)
            }
        }.start()
    }

    @ReactMethod
    fun disconnectUsb(promise: Promise) {
        promise.resolve(true)
    }
}
`;

      const packageContent = `package com.unipro.smart_cafe

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class UniversalPrinterPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(UniversalPrinterModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<View, ReactShadowNode<*>>> {
        return emptyList()
    }
}
`;

      fs.writeFileSync(path.join(javaDir, 'UniversalPrinterModule.kt'), moduleContent, 'utf8');
      fs.writeFileSync(path.join(javaDir, 'UniversalPrinterPackage.kt'), packageContent, 'utf8');

      // Now ensure UniversalPrinterPackage is added to MainApplication.kt
      const mainAppFile = path.join(javaDir, 'MainApplication.kt');
      if (fs.existsSync(mainAppFile)) {
        let mainAppContent = fs.readFileSync(mainAppFile, 'utf8');
        if (!mainAppContent.includes('UniversalPrinterPackage()')) {
          mainAppContent = mainAppContent.replace(
            /PackageList\(this\)\.packages\.apply\s*\{([^}]*)\}/s,
            (match, inner) => {
              return `PackageList(this).packages.apply {${inner}\n          add(UniversalPrinterPackage())\n        }`;
            }
          );
          fs.writeFileSync(mainAppFile, mainAppContent, 'utf8');
        }
      }

      return config;
    },
  ]);

  return config;
}

module.exports = withUniversalUsbPrinter;
