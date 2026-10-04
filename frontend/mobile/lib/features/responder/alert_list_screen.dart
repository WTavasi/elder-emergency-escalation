import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/sign_out_button.dart';
import 'alert_detail_controller.dart';
import 'alert_detail_screen.dart';
import 'alerts_controller.dart';
import 'widgets/state_pill.dart';

/// What a caregiver or responder opens the app to see.
///
/// One list, ordered by urgency, with the unanswered ones first. No dashboard, no
/// counters across the top: the question this screen answers is which emergency needs a
/// person right now, and anything else on it is in the way of that.
class AlertListScreen extends StatefulWidget {
  const AlertListScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<AlertListScreen> createState() => _AlertListScreenState();
}

class _AlertListScreenState extends State<AlertListScreen> {
  @override
  void initState() {
    super.initState();
    context.read<AlertsController>().start();
  }

  @override
  Widget build(BuildContext context) {
    final AlertsController alerts = context.watch<AlertsController>();
    final AuthController auth = context.read<AuthController>();
    final ThemeData theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(alerts.openOnly ? 'Open alerts' : 'All alerts'),
        actions: <Widget>[
          IconButton(
            onPressed: alerts.refresh,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
          ),
          SignOutButton(onPressed: auth.signOut),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: MzaziSpace.s16,
                vertical: MzaziSpace.s12,
              ),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      alerts.unansweredCount == 0
                          ? 'Nobody is waiting.'
                          : '${alerts.unansweredCount} waiting for somebody',
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  // A plain switch rather than a filter sheet. There are exactly two
                  // things to look at, and a sheet for two options is ceremony.
                  Semantics(
                    label: 'Show only open alerts',
                    child: Switch(value: alerts.openOnly, onChanged: alerts.setOpenOnly),
                  ),
                  Text('Open only', style: theme.textTheme.bodyMedium),
                ],
              ),
            ),
            if (alerts.error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  MzaziSpace.s16,
                  0,
                  MzaziSpace.s16,
                  MzaziSpace.s12,
                ),
                child: Notice(message: alerts.error!, isError: true),
              ),
            Expanded(
              child: _Body(alerts: alerts, api: widget.api),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.alerts, required this.api});

  final AlertsController alerts;
  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    if (alerts.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (alerts.alerts.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(MzaziSpace.s24),
          child: Text(
            alerts.openOnly
                ? 'No open alerts. You will see one here the moment it is raised.'
                : 'No alerts yet.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: alerts.refresh,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, 0, MzaziSpace.s16, MzaziSpace.s24),
        itemCount: alerts.alerts.length,
        separatorBuilder: (BuildContext _, int _) => const SizedBox(height: MzaziSpace.s12),
        itemBuilder: (BuildContext context, int index) {
          final AlertSummary alert = alerts.alerts[index];
          return _AlertCard(alert: alert, onOpen: () => _open(context, alert));
        },
      ),
    );
  }

  Future<void> _open(BuildContext context, AlertSummary alert) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => ChangeNotifierProvider<AlertDetailController>(
          create: (_) => AlertDetailController(api: api, eventId: alert.eventId),
          child: AlertDetailScreen(fallback: alert),
        ),
      ),
    );
    // Whatever happened on the detail screen changed this list, so it is re-read on the
    // way back rather than waiting out the poll interval.
    await alerts.refresh();
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.alert, required this.onOpen});

  final AlertSummary alert;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool needsSomebody = alert.state.isOpen && !alert.isAnswered;

    return Card(
      // The one place colour is allowed to carry weight, and it is backed by the word
      // 'Waiting' in the pill and by the position in the list.
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MzaziRadius.card),
        side: BorderSide(
          color: needsSomebody ? theme.colorScheme.error : theme.dividerColor,
          width: needsSomebody ? 2 : 1,
        ),
      ),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(MzaziRadius.card),
        child: Padding(
          padding: const EdgeInsets.all(MzaziSpace.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(child: Text(alert.elderName, style: theme.textTheme.titleMedium)),
                  StatePill(state: alert.state),
                ],
              ),
              const SizedBox(height: MzaziSpace.s8),
              Text(
                _line(alert),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.textTheme.bodySmall?.color,
                ),
              ),
              if (alert.addressLabel != null) ...<Widget>[
                const SizedBox(height: MzaziSpace.s4),
                Text(
                  alert.addressLabel!,
                  style: theme.textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// One line of context, chosen by what the reader most needs to know in this state.
  static String _line(AlertSummary alert) {
    final String raised = elapsedSince(alert.triggeredAt);
    final String severity = _severityWord(alert.severity);

    if (!alert.state.isOpen) return '$severity, raised $raised';
    if (alert.isAnswered) return '$severity, ${alert.ownerName} is responding';
    return '$severity, raised $raised, tier ${alert.currentTier}';
  }

  static String _severityWord(Severity severity) => switch (severity) {
    Severity.standard => 'Standard',
    Severity.elevated => 'Elevated',
    Severity.critical => 'Critical',
  };
}
