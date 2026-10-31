package expo.modules.dvdbluetoothhid

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHidDevice
import android.bluetooth.BluetoothHidDeviceAppSdpSettings
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

private const val STATE_EVENT = "onStateChange"
private const val MOUSE_REPORT_ID = 1

/**
 * HID report descriptor of a 3-button mouse with a wheel. Report 1: buttons (3 bits + 5 padding),
 * then relative X, Y and wheel as signed bytes.
 */
private val MOUSE_DESCRIPTOR = byteArrayOf(
  0x05, 0x01, // Usage Page (Generic Desktop)
  0x09, 0x02, // Usage (Mouse)
  0xA1.toByte(), 0x01, // Collection (Application)
  0x85.toByte(), MOUSE_REPORT_ID.toByte(), //   Report ID (1)
  0x09, 0x01, //   Usage (Pointer)
  0xA1.toByte(), 0x00, //   Collection (Physical)
  0x05, 0x09, //     Usage Page (Buttons)
  0x19, 0x01, //     Usage Minimum (1)
  0x29, 0x03, //     Usage Maximum (3)
  0x15, 0x00, //     Logical Minimum (0)
  0x25, 0x01, //     Logical Maximum (1)
  0x95.toByte(), 0x03, //     Report Count (3)
  0x75, 0x01, //     Report Size (1)
  0x81.toByte(), 0x02, //     Input (Data, Variable, Absolute)
  0x95.toByte(), 0x01, //     Report Count (1)
  0x75, 0x05, //     Report Size (5)
  0x81.toByte(), 0x03, //     Input (Constant): padding
  0x05, 0x01, //     Usage Page (Generic Desktop)
  0x09, 0x30, //     Usage (X)
  0x09, 0x31, //     Usage (Y)
  0x09, 0x38, //     Usage (Wheel)
  0x15, 0x81.toByte(), //     Logical Minimum (-127)
  0x25, 0x7F, //     Logical Maximum (127)
  0x75, 0x08, //     Report Size (8)
  0x95.toByte(), 0x03, //     Report Count (3)
  0x81.toByte(), 0x06, //     Input (Data, Variable, Relative)
  0xC0.toByte(), //   End Collection
  0xC0.toByte(), // End Collection
)

private class BluetoothHidException(code: String, message: String) : CodedException(code, message, null)

/**
 * Makes the phone a Bluetooth mouse (HID device profile, Android 9+), so Android TVs, which have
 * no cursor over Wi-Fi, show a real mouse pointer.
 */
@SuppressLint("MissingPermission") // Runtime permissions are requested from JS before start().
class BluetoothHidModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val adapter: BluetoothAdapter?
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private val executor = Executors.newSingleThreadExecutor()
  // Typed loosely so no field references a class added in Android 9 (API 28).
  private var hidCallback: Any? = null
  private var hid: BluetoothHidDevice? = null
  private var registered = false
  private var host: BluetoothDevice? = null
  private var pendingStart: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("DVDBluetoothHid")

    Events(STATE_EVENT)

    Function("isSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && adapter != null
    }

    Function("isEnabled") { adapter?.isEnabled == true }

    Function("getState") { state() }

    AsyncFunction("start") { promise: Promise -> start(promise) }

    AsyncFunction("stop") { stop() }

    AsyncFunction("getBondedDevices") {
      val devices = adapter?.bondedDevices ?: emptySet()
      devices.map { mapOf("name" to safeName(it), "address" to it.address) }
    }

    AsyncFunction("connect") { address: String ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val proxy = hid ?: throw BluetoothHidException("ERR_NOT_STARTED", "Chuột Bluetooth chưa được bật")
        val device = adapter?.getRemoteDevice(address)
          ?: throw BluetoothHidException("ERR_NO_ADAPTER", "Điện thoại không có Bluetooth")
        proxy.connect(device)
      } else {
        throw unsupported()
      }
    }

    AsyncFunction("disconnect") {
      val proxy = hid
      val device = host
      if (proxy != null && device != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        proxy.disconnect(device)
      }
    }

    AsyncFunction("requestDiscoverable") { seconds: Int ->
      val intent = Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE)
        .putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, seconds)
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    // Synchronous so pointer moves leave in order and without a thread hop.
    Function("sendMouse") { buttons: Int, dx: Int, dy: Int, wheel: Int ->
      sendMouse(buttons, dx, dy, wheel)
    }

    OnDestroy { stop() }
  }

  private fun unsupported() =
    BluetoothHidException("ERR_UNSUPPORTED", "Cần Android 9 trở lên để dùng chuột Bluetooth")

  private fun safeName(device: BluetoothDevice): String? =
    try {
      device.name
    } catch (e: SecurityException) {
      null
    }

  private fun state(): Map<String, Any?> {
    val device = host
    return mapOf(
      "registered" to registered,
      "connected" to (device != null),
      "deviceName" to device?.let { safeName(it) },
      "deviceAddress" to device?.address,
    )
  }

  private fun emitState() = sendEvent(STATE_EVENT, state())

  private fun start(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      promise.reject(unsupported())
      return
    }
    val bt = adapter
    if (bt == null) {
      promise.reject(BluetoothHidException("ERR_NO_ADAPTER", "Điện thoại không có Bluetooth"))
      return
    }
    if (!bt.isEnabled) {
      promise.reject(BluetoothHidException("ERR_BT_OFF", "Bluetooth đang tắt. Hãy bật Bluetooth rồi thử lại."))
      return
    }
    if (registered) {
      promise.resolve(state())
      return
    }
    pendingStart?.reject(BluetoothHidException("ERR_RESTARTED", "Đang khởi động lại"))
    pendingStart = promise
    val proxy = hid
    if (proxy != null) {
      register(proxy)
    } else if (!bt.getProfileProxy(context, profileListener, BluetoothProfile.HID_DEVICE)) {
      finishStart(BluetoothHidException("ERR_NO_PROFILE", "Điện thoại không hỗ trợ chế độ chuột Bluetooth"))
    }
  }

  private fun finishStart(error: CodedException?) {
    val promise = pendingStart ?: return
    pendingStart = null
    if (error != null) promise.reject(error) else promise.resolve(state())
  }

  private val profileListener = object : BluetoothProfile.ServiceListener {
    override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
      if (profile != BluetoothProfile.HID_DEVICE || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
      val device = proxy as BluetoothHidDevice
      hid = device
      register(device)
    }

    override fun onServiceDisconnected(profile: Int) {
      if (profile != BluetoothProfile.HID_DEVICE) return
      hid = null
      registered = false
      host = null
      finishStart(BluetoothHidException("ERR_NO_PROFILE", "Dịch vụ Bluetooth của điện thoại đã dừng"))
      emitState()
    }
  }

  @RequiresApi(Build.VERSION_CODES.P)
  private fun register(proxy: BluetoothHidDevice) {
    val sdp = BluetoothHidDeviceAppSdpSettings(
      "DVD Remote",
      "Chuột Bluetooth của DVD Remote",
      "DVD Remote",
      BluetoothHidDevice.SUBCLASS1_MOUSE,
      MOUSE_DESCRIPTOR,
    )
    val callback = hidCallback as? HidCallback ?: HidCallback().also { hidCallback = it }
    val accepted = try {
      proxy.registerApp(sdp, null, null, executor, callback)
    } catch (e: SecurityException) {
      false
    }
    if (!accepted) {
      finishStart(
        BluetoothHidException(
          "ERR_REGISTER",
          "Không bật được chế độ chuột. Hãy cấp quyền Bluetooth, và tắt ứng dụng chuột/bàn phím Bluetooth khác nếu có.",
        ),
      )
    }
  }

  @RequiresApi(Build.VERSION_CODES.P)
  private inner class HidCallback : BluetoothHidDevice.Callback() {
    override fun onAppStatusChanged(pluggedDevice: BluetoothDevice?, isRegistered: Boolean) {
      registered = isRegistered
      if (!isRegistered) host = null
      finishStart(
        if (isRegistered) null
        else BluetoothHidException("ERR_REGISTER", "Hệ thống đã tắt chế độ chuột Bluetooth của ứng dụng"),
      )
      emitState()
    }

    override fun onConnectionStateChanged(device: BluetoothDevice, state: Int) {
      when (state) {
        BluetoothProfile.STATE_CONNECTED -> host = device
        BluetoothProfile.STATE_DISCONNECTED -> if (host?.address == device.address) host = null
        else -> return
      }
      emitState()
    }

    override fun onGetReport(device: BluetoothDevice, type: Byte, id: Byte, bufferSize: Int) {
      // Some hosts read the current report once after connecting: report "no movement".
      hid?.replyReport(device, type, id, ByteArray(4))
    }
  }

  private fun clamp(value: Int) = value.coerceIn(-127, 127).toByte()

  private fun sendMouse(buttons: Int, dx: Int, dy: Int, wheel: Int): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
    val proxy = hid ?: return false
    val device = host ?: return false
    val report = byteArrayOf((buttons and 0x07).toByte(), clamp(dx), clamp(dy), clamp(wheel))
    return try {
      proxy.sendReport(device, MOUSE_REPORT_ID, report)
    } catch (e: SecurityException) {
      false
    }
  }

  private fun stop() {
    finishStart(BluetoothHidException("ERR_STOPPED", "Đã tắt chuột Bluetooth"))
    val proxy = hid
    if (proxy != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        proxy.unregisterApp()
      } catch (e: SecurityException) {
        // Permission was revoked: nothing to unregister.
      }
      adapter?.closeProfileProxy(BluetoothProfile.HID_DEVICE, proxy)
    }
    hid = null
    registered = false
    host = null
  }
}
