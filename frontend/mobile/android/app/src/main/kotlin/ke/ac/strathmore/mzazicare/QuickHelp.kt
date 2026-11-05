package ke.ac.strathmore.mzazicare

import android.content.Context
import android.content.Intent

/**
 * A request for help from outside the app's own button: the home-screen widget, the
 * quick-settings tile, a launcher shortcut, or the Assistant. Each opens MainActivity
 * with [ACTION]; the app takes the request once and raises the alert as the button
 * would, countdown and all.
 */
object QuickHelp {
    const val CHANNEL = "ke.ac.strathmore.mzazicare/quick_help"
    const val ACTION = "ke.ac.strathmore.mzazicare.HELP"

    private val SOURCES = setOf("assistant", "widget", "tile")

    /**
     * What the Assistant or a shortcut says is happening, read as the app's types.
     * Shortcuts send the type itself; the Assistant sends the words it heard.
     */
    private val TYPES = mapOf(
        "FIRE" to "FIRE", "fire" to "FIRE", "smoke" to "FIRE", "moto" to "FIRE",
        "FALL" to "FALL", "fall" to "FALL", "fell" to "FALL", "i fell" to "FALL",
        "nimeanguka" to "FALL",
        "BREATHING" to "BREATHING", "breathing" to "BREATHING", "chest" to "BREATHING",
        "chest pain" to "BREATHING", "kifua" to "BREATHING",
        "UNWELL" to "UNWELL", "unwell" to "UNWELL", "sick" to "UNWELL", "naumwa" to "UNWELL",
        "UNSAFE" to "UNSAFE", "unsafe" to "UNSAFE", "police" to "UNSAFE",
        "thief" to "UNSAFE", "thieves" to "UNSAFE", "polisi" to "UNSAFE", "wezi" to "UNSAFE",
    )

    fun intent(context: Context, from: String, type: String? = null): Intent =
        Intent(context, MainActivity::class.java).apply {
            action = ACTION
            putExtra("from", from)
            if (type != null) putExtra("type", type)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

    /** The request in [intent], or null when it is not one, or was opened from Recents. */
    fun read(intent: Intent?): Map<String, String>? {
        if (intent == null || intent.action != ACTION) return null
        // Reopening the app from Recents replays the intent that first opened it. That
        // must never ask for help a second time.
        if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return null
        val from = intent.getStringExtra("from")?.takeIf { it in SOURCES } ?: "assistant"
        val raw = intent.getStringExtra("type")?.trim()
        val type = raw?.let { TYPES[it] ?: TYPES[it.lowercase()] }
        return if (type == null) mapOf("from" to from) else mapOf("from" to from, "type" to type)
    }
}
