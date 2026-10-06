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
import 'widgets/severity_mark.dart';
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
        title: const Text('Alerts'),
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
            // Two views, as a segmented button rather than a switch. A switch says
            // on or off; these are two different lists, and the history one is where a
            // caregiver goes back to see what happened and how serious it was.
            Padding(
              padding: const EdgeInsets.fromLTRB(
                MzaziSpace.s16,
                MzaziSpace.s12,
                MzaziSpace.s16,
                MzaziSpace.s8,
              ),
              child: SizedBox(
                width: double.infinity,
                child: SegmentedButton<bool>(
                  segments: const <ButtonSegment<bool>>[
                    ButtonSegment<bool>(
                      value: true,
                      label: Text('Open'),
                      icon: Icon(Icons.notifications_active_outlined),
                    ),
                    ButtonSegment<bool>(
                      value: false,
                      label: Text('History'),
                      icon: Icon(Icons.history),
                    ),
                  ],
                  selected: <bool>{alerts.openOnly},
                  showSelectedIcon: false,
                  // Not Size.fromHeight: that asks for infinite width, which a segmented
                  // button's segments cannot give. A zero width with the 48-point floor
                  // keeps the touch target the rest of the app guarantees.
                  style: const ButtonStyle(
                    minimumSize: WidgetStatePropertyAll<Size>(
                      Size(0, MzaziA11y.standardMinTouchTarget),
                    ),
                  ),
                  onSelectionChanged: (Set<bool> chosen) => alerts.setOpenOnly(chosen.first),
                ),
              ),
            ),
            if (alerts.openOnly)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  MzaziSpace.s16,
                  MzaziSpace.s4,
                  MzaziSpace.s16,
                  MzaziSpace.s12,
                ),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    alerts.unansweredCount == 0
                        ? 'Nobody is waiting.'
                        : '${alerts.unansweredCount} waiting for somebody',
                    style: theme.textTheme.titleMedium,
                  ),
                ),
              )
            else
              const SizedBox(height: MzaziSpace.s8),
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
      final ThemeData theme = Theme.of(context);
      // An icon, a short title and one line, the same anatomy as the console's empty
      // states. Calm wording on purpose: no alerts is the good outcome.
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(MzaziSpace.s24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                alerts.openOnly ? Icons.check_circle_outline : Icons.inbox_outlined,
                size: 40,
                color: theme.textTheme.bodySmall?.color,
              ),
              const SizedBox(height: MzaziSpace.s12),
              Text(alerts.openOnly ? 'All clear' : 'No history yet', style: theme.textTheme.titleLarge),
              const SizedBox(height: MzaziSpace.s8),
              Text(
                alerts.openOnly
                    ? 'No open alerts. You will see one here the moment it is raised.'
                    : 'Alerts you were part of will be listed here once there are some.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge,
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: alerts.refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, 0, MzaziSpace.s16, MzaziSpace.s24),
        children: <Widget>[
          for (final _Group group in _groups(alerts.alerts, byDay: !alerts.openOnly)) ...<Widget>[
            if (group.heading != null)
              Padding(
                padding: const EdgeInsets.only(top: MzaziSpace.s8, bottom: MzaziSpace.s8),
                child: Semantics(
                  header: true,
                  child: Text(group.heading!, style: Theme.of(context).textTheme.titleSmall),
                ),
              ),
            for (final AlertSummary alert in group.alerts)
              Padding(
                padding: const EdgeInsets.only(bottom: MzaziSpace.s12),
                child: _AlertCard(alert: alert, onOpen: () => _open(context, alert)),
              ),
          ],
        ],
      ),
    );
  }

  /// The open list stays in urgency order with no headings. History is grouped by the
  /// day each alert was raised, newest first, because "what happened on Tuesday" is how
  /// a person looks back.
  static List<_Group> _groups(List<AlertSummary> alerts, {required bool byDay}) {
    if (!byDay) return <_Group>[_Group(null, alerts)];

    final List<AlertSummary> sorted = List<AlertSummary>.of(alerts)
      ..sort((AlertSummary a, AlertSummary b) => b.triggeredAt.compareTo(a.triggeredAt));
    final List<_Group> groups = <_Group>[];
    for (final AlertSummary alert in sorted) {
      final String heading = dayHeading(alert.triggeredAt);
      if (groups.isEmpty || groups.last.heading != heading) {
        groups.add(_Group(heading, <AlertSummary>[]));
      }
      groups.last.alerts.add(alert);
    }
    return groups;
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

class _Group {
  _Group(this.heading, this.alerts);

  final String? heading;
  final List<AlertSummary> alerts;
}

const List<String> _weekdays = <String>['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const List<String> _months = <String>[
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "Today", "Yesterday", or a short date, for the history headings.
String dayHeading(DateTime moment, {DateTime? now}) {
  final DateTime today = DateUtils.dateOnly(now ?? DateTime.now());
  final DateTime day = DateUtils.dateOnly(moment);
  final int daysAgo = today.difference(day).inDays;
  if (daysAgo == 0) return 'Today';
  if (daysAgo == 1) return 'Yesterday';
  return '${_weekdays[day.weekday - 1]} ${day.day} ${_months[day.month - 1]}';
}

/// One alert in the list: a severity tile on the left, then who, what and where, with
/// how long ago on the right.
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
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // The band as a shape, so the list can be scanned for the octagons before
              // a single name is read. Decorative to a screen reader: the line below
              // says the band in words.
              ExcludeSemantics(
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(MzaziRadius.card),
                  ),
                  child: Icon(
                    SeverityMark.glyph(alert.severity),
                    color: theme.textTheme.bodyLarge?.color,
                  ),
                ),
              ),
              const SizedBox(width: MzaziSpace.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Expanded(child: Text(alert.elderName, style: theme.textTheme.titleMedium)),
                        const SizedBox(width: MzaziSpace.s8),
                        Text(_when(alert.triggeredAt), style: theme.textTheme.bodySmall),
                      ],
                    ),
                    const SizedBox(height: MzaziSpace.s8),
                    StatePill(state: alert.state),
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
            ],
          ),
        ),
      ),
    );
  }

  /// How long ago for anything within a day, the clock time for older alerts, which
  /// already sit under a day heading.
  static String _when(DateTime triggeredAt) {
    if (DateTime.now().difference(triggeredAt).inHours < 24) return elapsedSince(triggeredAt);
    final String hh = triggeredAt.hour.toString().padLeft(2, '0');
    final String mm = triggeredAt.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  /// One line of context, chosen by what the reader most needs to know in this state.
  static String _line(AlertSummary alert) {
    final String severity = SeverityMark.word(alert.severity);

    if (!alert.state.isOpen) return '$severity severity';
    if (alert.isAnswered) return '$severity, ${alert.ownerName} is responding';
    return '$severity, tier ${alert.currentTier}';
  }
}
