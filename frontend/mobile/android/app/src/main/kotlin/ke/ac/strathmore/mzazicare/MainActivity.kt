package ke.ac.strathmore.mzazicare

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createEmergencyChannel()
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
