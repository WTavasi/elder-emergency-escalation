import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/live/live_updates.dart';
import '../../core/location/way_there.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/section_label.dart';
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
///
/// Edge to edge, one row per emergency, divided by hairlines. An emergency nobody has
/// answered carries a red rule down its left edge, so the ones that need somebody can be
/// found by running a thumb down the side of the screen before a name is read.
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
    final ThemeData theme = Theme.of(context);
    final int waiting = alerts.unansweredCount;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        // Pull down to refresh, which is where the refresh button in the app bar went.
        child: RefreshIndicator(
          onRefresh: alerts.refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: MzaziSpace.s24),
            children: <Widget>[
              // The only line under the title is the one that needs acting on: how many
              // nobody has answered yet. Anything else here was stating the obvious.
              PageTitle(
                'Alerts',
                subtitle: alerts.openOnly && waiting > 0 ? '$waiting waiting for somebody' : null,
                subtitleColor: theme.colorScheme.error,
              ),
              _ViewSwitch(openOnly: alerts.openOnly, onChanged: alerts.setOpenOnly),
              if (!alerts.openOnly) _HistorySearch(alerts: alerts),
              if (alerts.error != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    MzaziSpace.s16,
                    MzaziSpace.s16,
                    MzaziSpace.s16,
                    0,
                  ),
                  child: Notice(message: alerts.error!, isError: true),
                ),
              ..._rows(context, alerts),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _rows(BuildContext context, AlertsController alerts) {
    final ThemeData theme = Theme.of(context);

    if (alerts.isLoading) {
      return const <Widget>[
        Padding(
          padding: EdgeInsets.all(MzaziSpace.s32),
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }

    if (alerts.alerts.isEmpty) {
      // A title and one line, set where the list would start. Calm wording on purpose:
      // no alerts is the good outcome, and it needs no picture to say so.
      return <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, MzaziSpace.s32, MzaziSpace.s16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                alerts.openOnly
                    ? 'All clear'
                    : alerts.isSearching
                    ? 'Nothing found'
                    : 'No history yet',
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: MzaziSpace.s8),
              Text(
                alerts.openOnly
                    ? 'No open alerts. You will see one here the moment it is raised.'
                    : alerts.isSearching
                    ? 'No alerts match. Try part of a name, or other dates.'
                    : 'Alerts you were part of will be listed here once there are some.',
                style: theme.textTheme.bodyLarge,
              ),
            ],
          ),
        ),
      ];
    }

    return <Widget>[
      for (final _Group group in _groups(alerts.alerts, byDay: !alerts.openOnly)) ...<Widget>[
        if (group.heading != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, MzaziSpace.s24, MzaziSpace.s16, 0),
            child: SectionLabel(group.heading!),
          ),
        for (final AlertSummary alert in group.alerts) ...<Widget>[
          _AlertRow(alert: alert, onOpen: () => _open(context, alert, alerts)),
          const Divider(indent: MzaziSpace.s16),
        ],
      ],
    ];
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

  Future<void> _open(BuildContext context, AlertSummary alert, AlertsController alerts) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => ChangeNotifierProvider<AlertDetailController>(
          create: (BuildContext context) => AlertDetailController(
            api: widget.api,
            eventId: alert.eventId,
            myId: _myId(context),
            wayThere: WayThere.maybeOf(context),
            live: LiveUpdates.maybeOf(context),
          ),
          child: AlertDetailScreen(fallback: alert),
        ),
      ),
    );
    // Whatever happened on the detail screen changed this list, so it is re-read on the
    // way back rather than waiting out the poll interval.
    await alerts.refresh();
  }

  /// The signed-in account, or none where the list is built without one, as in a test.
  static String? _myId(BuildContext context) {
    try {
      return Provider.of<AuthController>(context, listen: false).account?.id;
    } on ProviderNotFoundException {
      return null;
    }
  }
}

class _Group {
  _Group(this.heading, this.alerts);

  final String? heading;
  final List<AlertSummary> alerts;
}

const List<String> _weekdays = <String>['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const List<String> _months = <String>[
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
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

/// Searching history: part of a name, the elder's or whoever attended, and the days.
///
/// A plain field and a calendar button under the tabs, only on History. The open list
/// is short and urgent, and a search box over it would be in the way.
class _HistorySearch extends StatefulWidget {
  const _HistorySearch({required this.alerts});

  final AlertsController alerts;

  @override
  State<_HistorySearch> createState() => _HistorySearchState();
}

class _HistorySearchState extends State<_HistorySearch> {
  late final TextEditingController _text = TextEditingController(text: widget.alerts.search);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _pickDays() async {
    final DateTime today = DateUtils.dateOnly(DateTime.now());
    final DateTimeRange? picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(today.year - 2),
      lastDate: today,
      initialDateRange: widget.alerts.days,
      helpText: 'Alerts raised between',
      saveText: 'Show',
    );
    if (picked != null) await widget.alerts.setDays(picked);
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final DateTimeRange? days = widget.alerts.days;

    return Padding(
      padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, MzaziSpace.s12, MzaziSpace.s8, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: TextField(
                  controller: _text,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Elder or who attended',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _text.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear the search',
                            icon: const Icon(Icons.close),
                            onPressed: () {
                              _text.clear();
                              widget.alerts.setSearch('');
                              setState(() {});
                            },
                          ),
                  ),
                  onChanged: (String value) {
                    widget.alerts.setSearch(value);
                    // Shows or hides the clear button.
                    setState(() {});
                  },
                ),
              ),
              IconButton(
                tooltip: 'Choose dates',
                icon: Icon(days == null ? Icons.calendar_today_outlined : Icons.event),
                onPressed: () => unawaited(_pickDays()),
              ),
            ],
          ),
          if (days != null)
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    'Raised ${_rangeWords(days)}',
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
                TextButton(
                  onPressed: () => unawaited(widget.alerts.setDays(null)),
                  child: const Text('All dates'),
                ),
              ],
            ),
        ],
      ),
    );
  }

  /// "today", "on Mon 12 Oct", or "from Mon 12 Oct to today", to follow "Raised".
  static String _rangeWords(DateTimeRange days) {
    final String start = _day(days.start);
    if (DateUtils.isSameDay(days.start, days.end)) {
      return start == 'today' || start == 'yesterday' ? start : 'on $start';
    }
    return 'from $start to ${_day(days.end)}';
  }

  /// A day heading in the middle of a sentence, where "Today" is "today".
  static String _day(DateTime day) {
    final String heading = dayHeading(day);
    return heading == 'Today' || heading == 'Yesterday' ? heading.toLowerCase() : heading;
  }
}

/// Open or History, as two words over a rule, the chosen one underlined in ink.
///
/// A Material segmented button is a rounded capsule, which on this screen would be the
/// one rounded shape left. Two tabs under the title say the same thing in type, and each
/// is a full-height touch target.
class _ViewSwitch extends StatelessWidget {
  const _ViewSwitch({required this.openOnly, required this.onChanged});

  final bool openOnly;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        children: <Widget>[
          _Tab(label: 'Open', selected: openOnly, onTap: () => onChanged(true)),
          _Tab(label: 'History', selected: !openOnly, onTap: () => onChanged(false)),
        ],
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color ink = selected ? theme.colorScheme.onSurface : theme.colorScheme.onSurfaceVariant;

    return Expanded(
      child: Semantics(
        selected: selected,
        button: true,
        child: InkWell(
          onTap: selected ? null : onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: MzaziA11y.standardMinTouchTarget),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: selected ? ink : Colors.transparent,
                  width: MzaziStroke.focus,
                ),
              ),
            ),
            child: Text(
              label,
              style: selected
                  ? theme.textTheme.titleSmall?.copyWith(color: ink)
                  : theme.textTheme.bodyMedium?.copyWith(color: ink),
            ),
          ),
        ),
      ),
    );
  }
}

/// One alert: who and how long ago on the first line, its state and band on the second,
/// where on the third. A red rule on the left edge while nobody has answered.
class _AlertRow extends StatelessWidget {
  const _AlertRow({required this.alert, required this.onOpen});

  final AlertSummary alert;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool needsSomebody = alert.state.isOpen && !alert.isAnswered;
    final TextStyle? quiet = theme.textTheme.bodySmall;

    return InkWell(
      onTap: onOpen,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            // The rule is backed by the word "Waiting" beside the glyph, so colour is
            // never the only thing saying it.
            Container(
              width: MzaziStroke.rule,
              color: needsSomebody ? theme.colorScheme.error : Colors.transparent,
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  MzaziSpace.s12,
                  MzaziSpace.s16,
                  MzaziSpace.s16,
                  MzaziSpace.s16,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: <Widget>[
                        Expanded(child: Text(alert.elderName, style: theme.textTheme.titleMedium)),
                        const SizedBox(width: MzaziSpace.s8),
                        // Figures in the monospaced face, so "4 min" and "12 min" line
                        // up down the list.
                        Text(
                          _when(alert.triggeredAt),
                          style: quiet?.copyWith(fontFamily: MzaziFont.mono),
                        ),
                      ],
                    ),
                    const SizedBox(height: MzaziSpace.s4),
                    Wrap(
                      spacing: MzaziSpace.s12,
                      runSpacing: MzaziSpace.s4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: <Widget>[
                        StatePill(state: alert.state),
                        SeverityMark(severity: alert.severity, style: quiet),
                        if (_who(alert) case final String who) Text(who, style: quiet),
                      ],
                    ),
                    if (alert.addressLabel != null) ...<Widget>[
                      const SizedBox(height: MzaziSpace.s4),
                      Text(
                        alert.addressLabel!,
                        style: quiet,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
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

  /// Who it is with, when that is what the reader most needs next.
  static String? _who(AlertSummary alert) {
    // In history, who attended, which is also what a search by name finds.
    if (!alert.state.isOpen) {
      return alert.ownerName == null ? null : '${alert.ownerName} attended';
    }
    if (alert.state == EventState.onScene) return '${alert.ownerName} is there';
    if (alert.isAnswered) return '${alert.ownerName} is responding';
    return 'Tier ${alert.currentTier}';
  }
}
