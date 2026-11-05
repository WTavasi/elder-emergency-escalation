import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/section_label.dart';

/// The daily check-in, as a section of a page: how it is set up, the last few answers,
/// and the way to change it.
///
/// The same section on the elder's own page and on the circle's page for that elder,
/// worded for whoever is reading. The elder's change takes effect at once; anybody
/// else's waits for the elder to agree on their own phone, which the server enforces
/// and this section only explains.
class CheckInSettings extends StatefulWidget {
  const CheckInSettings({
    required this.api,
    required this.elderId,
    required this.elderName,
    this.forElder = false,
    this.heading = true,
    super.key,
  });

  final ApiClient api;
  final String elderId;
  final String elderName;

  /// Read by the elder themselves, so "you" rather than their name.
  final bool forElder;

  /// Its own small-capitals heading, with the change beside it. Off inside a row that
  /// already names it, where the change goes under the summary instead.
  final bool heading;

  @override
  State<CheckInSettings> createState() => _CheckInSettingsState();
}

class _CheckInSettingsState extends State<CheckInSettings> {
  CheckInsOverview? _overview;
  String? _error;
  bool _busy = false;

  String get _first => widget.elderName.split(' ').first;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final CheckInsOverview overview = await widget.api.checkIns(widget.elderId);
      if (mounted) setState(() => _overview = overview);
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on NetworkException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
  }

  Future<void> _change() async {
    final CheckInSchedule? current = _overview?.schedule;
    final CheckInDraft? draft = await showModalBottomSheet<CheckInDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => CheckInSheet(
        initial: CheckInDraft.from(current),
        forElder: widget.forElder,
        elderFirstName: _first,
      ),
    );
    if (draft == null || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final CheckInsOverview updated = await widget.api.setCheckIns(
        widget.elderId,
        enabled: draft.enabled,
        times: draft.enabled ? draft.times : const <String>[],
        graceMinutes: draft.graceMinutes,
        every: draft.enabled ? draft.every : null,
      );
      if (mounted) setState(() => _overview = updated);
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on NetworkException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
    if (mounted) setState(() => _busy = false);
  }

  String _summary(CheckInsOverview overview) {
    final CheckInSchedule? schedule = overview.schedule;
    if (schedule == null || !schedule.enabled) {
      return widget.forElder
          ? "Off. We can ask you each day if you're OK, and tell your family if you do not answer."
          : "Off. We can ask $_first each day if they're OK. No answer? We tell the people below. "
                '$_first must agree first.';
    }
    final String when = schedule.inWords;
    final int grace = schedule.graceMinutes;
    if (schedule.waitingForElder) {
      return widget.forElder
          ? '$when, after you agree on your home screen.'
          : '$when, after $_first agrees on their phone.';
    }
    return widget.forElder
        ? '$when. No answer in $grace minutes? We tell your family.'
        : '$when. No answer in $grace minutes? We alert the people below, like a '
              'help-button press.';
  }

  /// When the elder agreed, for the circle, and how soon they usually answer.
  List<String> _details(CheckInsOverview overview) {
    final CheckInSchedule? schedule = overview.schedule;
    if (schedule == null || !schedule.enabled) return const <String>[];
    final DateTime? agreed = schedule.agreedAt;
    final CheckInRhythm? rhythm = overview.rhythm;
    return <String>[
      if (!widget.forElder && agreed != null && !schedule.waitingForElder)
        '$_first agreed on ${agreed.day} ${_months[agreed.month - 1]}.',
      if (rhythm != null)
        widget.forElder
            ? 'You usually answer within ${_minutes(rhythm.usualMinutes)}. No answer after '
                  '${_minutes(rhythm.nudgeAfterMinutes)}? We remind you.'
            : '$_first usually answers within ${_minutes(rhythm.usualMinutes)}. No answer after '
                  '${_minutes(rhythm.nudgeAfterMinutes)}? We remind them.',
    ];
  }

  static String _minutes(int minutes) => minutes <= 1 ? 'a minute' : '$minutes minutes';

  static const List<String> _months = <String>[
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

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final CheckInsOverview? overview = _overview;
    // The elder may always change their own; the server says for anybody else.
    final bool canChange = overview != null && (widget.forElder || overview.canEdit);
    final List<CheckIn> recent = overview?.recent.take(3).toList() ?? const <CheckIn>[];

    final Widget? change = canChange
        ? TextButton(
            onPressed: _busy ? null : () => unawaited(_change()),
            child: Text(overview.isOn ? 'Change times' : 'Set up'),
          )
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (widget.heading) ...<Widget>[
          SectionLabel('Daily check-in', trailing: change),
          const SizedBox(height: MzaziSpace.s8),
        ],
        if (overview != null) Text(_summary(overview), style: theme.textTheme.bodyLarge),
        if (overview != null)
          for (final String line in _details(overview)) ...<Widget>[
            const SizedBox(height: MzaziSpace.s4),
            Text(line, style: theme.textTheme.bodyMedium),
          ],
        if (!widget.heading && change != null)
          Align(alignment: AlignmentDirectional.centerStart, child: change),
        if (_error case final String failure) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Notice(message: failure, isError: true),
        ],
        // The circle sees the last few answers; the elder knows whether they answered.
        if (!widget.forElder && recent.isNotEmpty) ...<Widget>[
          const SizedBox(height: MzaziSpace.s12),
          for (final CheckIn checkIn in recent)
            Padding(
              padding: const EdgeInsets.only(bottom: MzaziSpace.s4),
              child: Text(describeCheckIn(checkIn), style: theme.textTheme.bodyMedium),
            ),
        ],
      ],
    );
  }
}

/// One line of history: "Today 09:00: answered in the app".
String describeCheckIn(CheckIn checkIn, {DateTime? now}) {
  final DateTime at = checkIn.dueAt;
  final DateTime today = DateUtils.dateOnly(now ?? DateTime.now());
  final DateTime day = DateUtils.dateOnly(at);
  final int ago = today.difference(day).inDays;
  const List<String> weekdays = <String>['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  final String when = switch (ago) {
    0 => 'Today',
    1 => 'Yesterday',
    _ => weekdays[at.weekday - 1],
  };
  final String clock =
      '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';
  final String by = checkIn.answeredVia == 'sms' ? 'by text' : 'in the app';

  final String what = switch (checkIn.status) {
    CheckInStatus.pending => 'waiting for an answer',
    CheckInStatus.answered => 'answered $by',
    CheckInStatus.missed when checkIn.answeredLate => 'late, then answered $by',
    CheckInStatus.missed => 'missed, care circle alerted',
  };
  return '$when $clock: $what';
}

/// What the sheet hands back.
class CheckInDraft {
  const CheckInDraft({
    required this.enabled,
    required this.times,
    required this.graceMinutes,
    this.every,
  });

  /// Nothing set up yet: one check-in, at nine in the morning, half an hour to answer.
  factory CheckInDraft.from(CheckInSchedule? schedule) => CheckInDraft(
    enabled: schedule?.enabled ?? false,
    times: schedule == null || schedule.times.isEmpty || schedule.every != null
        ? const <String>['09:00']
        : schedule.times,
    graceMinutes: schedule?.graceMinutes ?? 30,
    every: schedule?.every,
  );

  final bool enabled;
  final List<String> times;
  final int graceMinutes;

  /// Every so often through the day, instead of [times].
  final CheckInEvery? every;
}

/// Turning it on or off, and choosing up to three times a day, or every so often
/// through part of it.
class CheckInSheet extends StatefulWidget {
  const CheckInSheet({
    required this.initial,
    required this.forElder,
    required this.elderFirstName,
    super.key,
  });

  final CheckInDraft initial;
  final bool forElder;
  final String elderFirstName;

  /// More than this stops being a check-in and starts being supervision. The server
  /// holds the same limit.
  static const int mostTimes = 3;

  static const List<int> graceChoices = <int>[15, 30, 45, 60, 90, 120];

  /// How often, when it is every so often: 0 is times chosen one by one.
  static const List<int> everyChoices = <int>[0, 60, 120, 180, 240];

  @override
  State<CheckInSheet> createState() => _CheckInSheetState();
}

class _CheckInSheetState extends State<CheckInSheet> {
  late bool _enabled = widget.initial.enabled;
  late final List<String> _times = List<String>.of(widget.initial.times);
  late int _grace = CheckInSheet.graceChoices.contains(widget.initial.graceMinutes)
      ? widget.initial.graceMinutes
      : 30;
  late int _every = CheckInSheet.everyChoices.contains(widget.initial.every?.minutes)
      ? widget.initial.every!.minutes
      : 0;
  late String _from = widget.initial.every?.from ?? '08:00';
  late String _until = widget.initial.every?.until ?? '20:00';

  /// Times to answer that end before the next check-in is asked.
  List<int> get _graces => <int>[
    for (final int minutes in CheckInSheet.graceChoices)
      if (_every == 0 || minutes < _every) minutes,
  ];

  Future<void> _pick(bool start) async {
    final List<String> parts = (start ? _from : _until).split(':');
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1])),
      helpText: start ? 'Start asking at' : 'Stop asking at',
    );
    if (picked == null || !mounted) return;
    final String time =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    setState(() => start ? _from = time : _until = time);
  }

  Future<void> _addTime() async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 18, minute: 0),
      helpText: 'Ask at',
    );
    if (picked == null || !mounted) return;
    final String time =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    if (_times.contains(time)) return;
    // "09:00" sorts as text in time order, because every time has two digits.
    setState(() {
      _times
        ..add(time)
        ..sort();
    });
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool canSave =
        !_enabled || (_every == 0 ? _times.isNotEmpty : _until.compareTo(_from) > 0);
    final int grace = _graces.contains(_grace) ? _grace : _graces.last;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        MzaziSpace.s24,
        MzaziSpace.s24,
        MzaziSpace.s24,
        MzaziSpace.s24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Daily check-in', style: theme.textTheme.headlineSmall),
            const SizedBox(height: MzaziSpace.s8),
            Text(
              widget.forElder
                  ? "We'll ask if you're OK at these times. One tap answers."
                  : "We'll ask ${widget.elderFirstName} if they're OK at these times. "
                        '${widget.elderFirstName} must agree first.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: MzaziSpace.s16),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Ask every day'),
              value: _enabled,
              onChanged: (bool on) => setState(() => _enabled = on),
            ),
            if (_enabled) ...<Widget>[
              const SizedBox(height: MzaziSpace.s8),
              DropdownButtonFormField<int>(
                initialValue: _every,
                decoration: const InputDecoration(labelText: 'How often'),
                items: <DropdownMenuItem<int>>[
                  for (final int minutes in CheckInSheet.everyChoices)
                    DropdownMenuItem<int>(
                      value: minutes,
                      child: Text(
                        minutes == 0
                            ? 'At times I choose'
                            : _capitalised(CheckInEvery.stepInWords(minutes)),
                      ),
                    ),
                ],
                onChanged: (int? minutes) => setState(() => _every = minutes ?? _every),
              ),
              const SizedBox(height: MzaziSpace.s12),
            ],
            if (_enabled && _every != 0) ...<Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => unawaited(_pick(true)),
                      child: Text('From $_from'),
                    ),
                  ),
                  const SizedBox(width: MzaziSpace.s8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => unawaited(_pick(false)),
                      child: Text('Until $_until'),
                    ),
                  ),
                ],
              ),
              if (_until.compareTo(_from) <= 0) ...<Widget>[
                const SizedBox(height: MzaziSpace.s8),
                Text('Stop asking later than you start.', style: theme.textTheme.bodyMedium),
              ],
            ],
            if (_enabled && _every == 0) ...<Widget>[
              Wrap(
                spacing: MzaziSpace.s8,
                runSpacing: MzaziSpace.s8,
                children: <Widget>[
                  for (final String time in _times)
                    InputChip(
                      label: Text(time),
                      onDeleted: () => setState(() => _times.remove(time)),
                      deleteButtonTooltipMessage: 'Remove $time',
                    ),
                ],
              ),
              if (_times.length < CheckInSheet.mostTimes)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => unawaited(_addTime()),
                    icon: const Icon(Icons.add_alarm_outlined),
                    label: const Text('Add a time'),
                  ),
                ),
            ],
            if (_enabled) ...<Widget>[
              const SizedBox(height: MzaziSpace.s16),
              DropdownButtonFormField<int>(
                key: ValueKey<int>(_every),
                initialValue: grace,
                decoration: const InputDecoration(labelText: 'Time to answer'),
                items: <DropdownMenuItem<int>>[
                  for (final int minutes in _graces)
                    DropdownMenuItem<int>(
                      value: minutes,
                      child: Text(minutes < 60 ? '$minutes minutes' : _hours(minutes)),
                    ),
                ],
                onChanged: (int? minutes) => setState(() => _grace = minutes ?? _grace),
              ),
            ],
            const SizedBox(height: MzaziSpace.s24),
            FilledButton(
              onPressed: canSave
                  ? () => Navigator.of(context).pop(
                      CheckInDraft(
                        enabled: _enabled,
                        times: List<String>.unmodifiable(_times),
                        graceMinutes: grace,
                        every: _every == 0
                            ? null
                            : CheckInEvery(minutes: _every, from: _from, until: _until),
                      ),
                    )
                  : null,
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  static String _capitalised(String text) => '${text[0].toUpperCase()}${text.substring(1)}';

  static String _hours(int minutes) {
    final int hours = minutes ~/ 60;
    final int rest = minutes % 60;
    final String whole = hours == 1 ? '1 hour' : '$hours hours';
    return rest == 0 ? whole : '$whole $rest minutes';
  }
}
