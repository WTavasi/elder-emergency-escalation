package ke.ac.strathmore.mzazicare

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/**
 * A Help button on the home screen. One press opens MzaziCare and starts the alert, with
 * the countdown to stop it, exactly as the button inside the app does.
 */
class HelpWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        val open = PendingIntent.getActivity(
            context,
            REQUEST_CODE,
            QuickHelp.intent(context, "widget"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        for (id in widgetIds) {
            val views = RemoteViews(context.packageName, R.layout.help_widget)
            views.setOnClickPendingIntent(R.id.help_widget_button, open)
            manager.updateAppWidget(id, views)
        }
    }

    private companion object {
        const val REQUEST_CODE = 41
    }
}
