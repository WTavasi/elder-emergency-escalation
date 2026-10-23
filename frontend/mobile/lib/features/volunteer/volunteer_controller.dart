import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/live/live_updates.dart';

/// A community volunteer's side of the app: their application, whether they are
/// available, and the emergencies near them they were asked about.
///
/// A volunteer is never part of an elder's chain, so no socket room carries changes to
/// them. A push brings a new call while the app is open; behind it the calls are asked
/// for every [pollInterval] while the volunteer is available or on their way somewhere.
class VolunteerController extends ChangeNotifier {
  VolunteerController({
    required ApiClient api,
    LiveUpdates? live,
    this.pollInterval = const Duration(seconds: 20),
  }) : _api = api {
    _live = LiveFollower(live: live, wants: (LiveChange _) => true, refresh: refreshCalls);
  }

  final ApiClient _api;
  late final LiveFollower _live;

  /// Null asks only when told to, which a test uses to drive it by hand.
  final Duration? pollInterval;

  VolunteerProfile _profile = VolunteerProfile.none;
  List<VolunteerCall> _calls = const <VolunteerCall>[];
  bool _loading = true;
  bool _busy = false;
  String? _error;
  Timer? _poll;
  bool _disposed = false;

  VolunteerProfile get profile => _profile;
  bool get loading => _loading;
  bool get busy => _busy;
  String? get error => _error;

  /// Asked and still waiting for this volunteer's answer.
  List<VolunteerCall> get waiting =>
      _calls.where((VolunteerCall call) => call.waiting).toList(growable: false);

  /// The one emergency this volunteer said they would go to, if any is open.
  VolunteerCall? get going => _calls.where((VolunteerCall call) => call.going).firstOrNull;

  /// Everything else: answered, covered by somebody else, or over.
  List<VolunteerCall> get earlier => _calls
      .where((VolunteerCall call) => !call.waiting && !call.going)
      .toList(growable: false);

  VolunteerCall? call(String eventId) =>
      _calls.where((VolunteerCall call) => call.eventId == eventId).firstOrNull;

  void start() {
    _live.start();
    final Duration? every = pollInterval;
    if (every != null) {
      _poll ??= Timer.periodic(every, (_) {
        if (_profile.available || going != null) unawaited(refreshCalls());
      });
    }
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final VolunteerProfile profile = await _api.volunteerProfile();
      final List<VolunteerCall> calls = profile.status == VolunteerStatus.notApplied
          ? const <VolunteerCall>[]
          : await _api.volunteerCalls();
      if (_disposed) return;
      _profile = profile;
      _calls = calls;
      _error = null;
    } on ApiException catch (failure) {
      _error = failure.message;
    } on NetworkException catch (failure) {
      _error = failure.message;
    }
    if (_disposed) return;
    _loading = false;
    notifyListeners();
  }

  Future<void> refreshCalls() async {
    _live.asked();
    try {
      final List<VolunteerCall> calls = await _api.volunteerCalls();
      if (_disposed) return;
      _calls = calls;
      notifyListeners();
    } on Exception {
      // The next tick tries again. Nothing on screen is wrong for a missed refresh.
    }
  }

  /// Sends or changes the application. True when it went through.
  Future<bool> apply({
    required List<VolunteerTraining> training,
    required AddressMatch area,
    required double radiusKm,
    String? note,
  }) => _run(() async {
    _profile = await _api.applyToVolunteer(
      training: training,
      area: area,
      radiusKm: radiusKm,
      note: note,
    );
  });

  /// "I'm available", or not.
  Future<bool> setAvailable(bool available) => _run(() async {
    _profile = await _api.setVolunteerAvailable(available);
    if (available) await refreshCalls();
  });

  /// "I can go", "I cannot go", "I can no longer go", "I'm here". Whatever happens, the
  /// call is shown as the server now has it: a 409 for "somebody else is going" is an
  /// answer too, and is shown as one.
  Future<bool> answer(String eventId, VolunteerAnswer answer) async {
    final bool done = await _run(() async {
      final VolunteerCall updated = await _api.answerVolunteerCall(eventId, answer);
      _calls = <VolunteerCall>[
        for (final VolunteerCall call in _calls) call.eventId == eventId ? updated : call,
      ];
    });
    if (!done) await refreshCalls();
    return done;
  }

  /// Fetches one call fresh, for its own screen.
  Future<void> refreshCall(String eventId) async {
    try {
      final VolunteerCall updated = await _api.volunteerCall(eventId);
      if (_disposed) return;
      final bool known = _calls.any((VolunteerCall call) => call.eventId == eventId);
      _calls = known
          ? <VolunteerCall>[
              for (final VolunteerCall call in _calls) call.eventId == eventId ? updated : call,
            ]
          : <VolunteerCall>[updated, ..._calls];
      notifyListeners();
    } on Exception {
      // Shown as it was; the poll catches up.
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  Future<bool> _run(Future<void> Function() work) async {
    if (_busy) return false;
    _busy = true;
    _error = null;
    notifyListeners();
    bool ok = false;
    try {
      await work();
      ok = true;
    } on ApiException catch (failure) {
      _error = failure.message;
    } on NetworkException catch (failure) {
      _error = failure.message;
    }
    if (_disposed) return ok;
    _busy = false;
    notifyListeners();
    return ok;
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    _poll = null;
    _live.dispose();
    super.dispose();
  }
}
