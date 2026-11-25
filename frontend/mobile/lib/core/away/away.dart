import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';

/// How long somebody chooses to be away, from the sheet on their own page.
enum AwayFor {
  hour('For 1 hour', Icons.timer_outlined),
  fourHours('For 4 hours', Icons.hourglass_bottom),
  tomorrowMorning('Until tomorrow morning', Icons.bedtime_outlined),
  untilOff('Until I turn it off', Icons.do_not_disturb_on_outlined);

  const AwayFor(this.label, this.icon);

  final String label;
  final IconData icon;

  /// When they will be back, from [now]. Null for until they turn it off.
  DateTime? until(DateTime now) => switch (this) {
    AwayFor.hour => now.add(const Duration(hours: 1)),
    AwayFor.fourHours => now.add(const Duration(hours: 4)),
    // Eight the next morning, which is when a night away ends for most people.
    AwayFor.tomorrowMorning => DateTime(now.year, now.month, now.day + 1, 8),
    AwayFor.untilOff => null,
  };
}

/// For your own page: "Until 18:00", "Until tomorrow, 8:00", "Until 5 Dec, 8:00", or
/// "Until you turn it off".
String awayUntilLabel(DateTime? until, {DateTime? now}) =>
    until == null ? 'Until you turn it off' : 'Until ${_when(until, now ?? DateTime.now())}';

/// For somebody else: "Away until 18:00", or just "Away" when they gave no end.
String awayLabel(DateTime? until, {DateTime? now}) =>
    until == null ? 'Away' : 'Away until ${_when(until, now ?? DateTime.now())}';

/// "18:00" today, "tomorrow, 8:00", or "5 Dec, 8:00".
String _when(DateTime until, DateTime now) {
  final String time = '${until.hour}:${until.minute.toString().padLeft(2, '0')}';
  final int days = DateTime(
    until.year,
    until.month,
    until.day,
  ).difference(DateTime(now.year, now.month, now.day)).inDays;
  if (days == 0) return time;
  if (days == 1) return 'tomorrow, $time';
  return '${until.day} ${_months[until.month - 1]}, $time';
}

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

/// Whether the signed-in caregiver or family member is away for a while.
///
/// Away, they still get every alert, but nobody waits for their answer: the next people
/// are asked straight away. At the end they chose they are back by themselves, here and
/// on the server, with nothing to switch off.
class AwayController extends ChangeNotifier {
  AwayController({required ApiClient api, DateTime Function()? clock})
    : _api = api,
      _clock = clock ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _clock;

  AwayStatus _status = AwayStatus.here;
  bool _loaded = false;
  bool _saving = false;
  String? _problem;
  Timer? _back;
  bool _disposed = false;

  AwayStatus get status => _status;
  bool get away => _status.away;
  bool get isLoaded => _loaded;
  bool get isSaving => _saving;

  /// Why the last change did not go through, in words for the screen.
  String? get problem => _problem;

  static AwayController? maybeOf(BuildContext context) {
    try {
      return Provider.of<AwayController>(context, listen: false);
    } on ProviderNotFoundException {
      return null;
    }
  }

  Future<void> load() async {
    try {
      _show(await _api.away());
      _loaded = true;
    } on ApiException {
      // Unknown: shown as not away, and the switch still works.
      _loaded = true;
    } on NetworkException {
      _loaded = true;
    }
    _notify();
  }

  /// Away for [length]. Returns what the server said, so the page can say who is left.
  Future<AwayStatus?> goAway(AwayFor length) =>
      _change(() => _api.goAway(until: length.until(_clock())));

  Future<AwayStatus?> comeBack() => _change(_api.comeBack);

  Future<AwayStatus?> _change(Future<AwayStatus> Function() call) async {
    _saving = true;
    _problem = null;
    _notify();
    try {
      final AwayStatus status = await call();
      _show(status);
      return status;
    } on ApiException catch (failure) {
      _problem = failure.message;
    } on NetworkException catch (failure) {
      _problem = failure.message;
    } finally {
      _saving = false;
      _notify();
    }
    return null;
  }

  void _show(AwayStatus status) {
    _status = status;
    _back?.cancel();
    final DateTime? until = status.away ? status.until : null;
    if (until != null) {
      final Duration left = until.difference(_clock());
      _back = Timer(left.isNegative ? Duration.zero : left, () {
        _status = AwayStatus.here;
        _notify();
      });
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _back?.cancel();
    super.dispose();
  }
}
