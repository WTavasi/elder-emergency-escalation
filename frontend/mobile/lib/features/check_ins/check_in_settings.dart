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
    super.key,
  });

  final ApiClient api;
  final String elderId;
  final String elderName;

  /// Read by the elder themselves, so "you" rather than their name.
  final bool forElder;

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
          ? 'Off. MzaziCare can ask you each day whether you are all right, and tell your '
                'family if you do not answer.'
          : 'Off. MzaziCare can ask $_first each day whether they are all right, and tell '
                'the people below if they do not answer. $_first is asked to agree first.';
    }
    final String times = schedule.timesInWords;
    final int grace = schedule.graceMinutes;
    if (schedule.waitingForElder) {
      return widget.forElder
          ? 'Every day at $times, once you agree on your home screen.'
          : 'Every day at $times, once $_first agrees on their phone. Nothing is asked '
                'until then.';
    }
    return widget.forElder
        ? 'Every day at $times. If you do not answer within $grace minutes, your family '
              'is told.'
        : 'Every day at $times. If $_first does not answer within $grace minutes, the '
              'people below are alerted, as for a press of the help button.';
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final CheckInsOverview? overview = _overview;
    // The elder may always change their own; the server says for anybody else.
    final bool canChange = overview != null && (widget.forElder || overview.canEdit);
    final List<CheckIn> recent = overview?.recent.take(3).toList() ?? const <CheckIn>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        SectionLabel(
          'Daily check-in',
          trailing: canChange
              ? TextButton(
                  onPressed: _busy ? null : () => unawaited(_change()),
                  child: Text(overview.isOn ? 'Change times' : 'Set up'),
                )
              : null,
        ),
        const SizedBox(height: MzaziSpace.s8),
        if (overview != null) Text(_summary(overview), style: theme.textTheme.bodyLarge),
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
    CheckInStatus.missed when checkIn.answeredLate => 'not answered in time, then answered $by',
    CheckInStatus.missed => 'not answered, the chain was alerted',
  };
  return '$when $clock: $what';
}

/// What the sheet hands back.
class CheckInDraft {
  const CheckInDraft({required this.enabled, required this.times, required this.graceMinutes});

  /// Nothing set up yet: one check-in, at nine in the morning, half an hour to answer.
  factory CheckInDraft.from(CheckInSchedule? schedule) => CheckInDraft(
    enabled: schedule?.enabled ?? false,
    times: schedule == null || schedule.times.isEmpty ? const <String>['09:00'] : schedule.times,
    graceMinutes: schedule?.graceMinutes ?? 30,
  );

  final bool enabled;
  final List<String> times;
  final int graceMinutes;
}

/// Turning it on or off, and choosing up to three times a day.
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

  @override
  State<CheckInSheet> createState() => _CheckInSheetState();
}

class _CheckInSheetState extends State<CheckInSheet> {
  late bool _enabled = widget.initial.enabled;
  late final List<String> _times = List<String>.of(widget.initial.times);
  late int _grace = CheckInSheet.graceChoices.contains(widget.initial.graceMinutes)
      ? widget.initial.graceMinutes
      : 30;

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
    final bool canSave = !_enabled || _times.isNotEmpty;

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
                  ? 'Each day at these times you are asked whether you are all right. One '
                        'press answers it.'
                  : 'Each day at these times ${widget.elderFirstName} is asked whether they '
                        'are all right. ${widget.elderFirstName} will be asked to agree '
                        'before it starts.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: MzaziSpace.s16),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Ask every day'),
              value: _enabled,
              onChanged: (bool on) => setState(() => _enabled = on),
            ),
            if (_enabled) ...<Widget>[
              const SizedBox(height: MzaziSpace.s8),
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
              const SizedBox(height: MzaziSpace.s16),
              DropdownButtonFormField<int>(
                initialValue: _grace,
                decoration: const InputDecoration(labelText: 'Time to answer'),
                items: <DropdownMenuItem<int>>[
                  for (final int minutes in CheckInSheet.graceChoices)
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
                        graceMinutes: _grace,
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

  static String _hours(int minutes) {
    final int hours = minutes ~/ 60;
    final int rest = minutes % 60;
    final String whole = hours == 1 ? '1 hour' : '$hours hours';
    return rest == 0 ? whole : '$whole $rest minutes';
  }
}
