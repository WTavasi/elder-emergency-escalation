package ke.ac.strathmore.mzazicare

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var quickHelp: MethodChannel? = null

    /** A request for help waiting for the app to take it. Taken once. */
    private var pending: Map<String, String>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        // Before the engine starts, so the app finds it when it first asks. Not when the
        // activity is being restored, which replays the intent that opened it.
        if (savedInstanceState == null) keep(intent)
        super.onCreate(savedInstanceState)
        createEmergencyChannel()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // The app is already open: tell it there is a request, and it takes it.
        if (keep(intent)) quickHelp?.invokeMethod("help", null)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        quickHelp = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, QuickHelp.CHANNEL).apply {
            setMethodCallHandler { call, result ->
                if (call.method == "takePending") {
                    result.success(pending)
                    pending = null
                } else {
                    result.notImplemented()
                }
            }
        }
    }

    private fun keep(intent: Intent?): Boolean {
        val request = QuickHelp.read(intent) ?: return false
        pending = request
        return true
    }

    // The server sends every alert on the "emergencies" channel. Android 8 and later
    // file a notification under a channel the app created, and a channel that does not
    // exist falls back to a default one at ordinary importance, which does not make a
    // sound over a muted conversation or show on top of another app. High importance
    // does both. The person can still turn it down in Settings; the app only proposes.
    private fun createEmergencyChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            "emergencies",
            "Emergencies",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Alerts from the people you care for, and updates on them."
            enableVibration(true)
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
}
