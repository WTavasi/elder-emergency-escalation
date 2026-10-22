import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/live/live_updates.dart';

/// The elder's side of the daily check-in: whether one is waiting, whether somebody set
/// one up that needs their agreement, and the answer.
///
/// It looks when the app opens, when a check-in push arrives while the app is open, and
/// every couple of minutes behind that, because a phone with no push (a development
/// build, or notifications turned off) still has to show the question in time.
class CheckInController extends ChangeNotifier {
  CheckInController({
    required ApiClient api,
    required this.elderId,
    LiveUpdates? live,
    this.pollInterval = const Duration(minutes: 2),
  }) : _api = api,
       _live = live;

  final ApiClient _api;
  final LiveUpdates? _live;
  final String elderId;

  /// Null asks only when told to, which a test uses to drive it by hand.
  final Duration? pollInterval;

  ElderCheckIns _mine = ElderCheckIns.none;
  CheckInAnswer? _answer;
  String? _error;
  bool _busy = false;
  bool _disposed = false;
  Timer? _poll;
  StreamSubscription<void>? _pushes;

  ElderCheckIns get mine => _mine;

  /// What the last "I am all right" did, while its thank-you is on screen.
  CheckInAnswer? get answer => _answer;
  String? get error => _error;
  bool get busy => _busy;

  void start() {
    _pushes ??= _live?.checkIns.listen((_) => unawaited(refresh()));
    final Duration? every = pollInterval;
    if (every != null) {
      _poll ??= Timer.periodic(every, (_) => unawaited(refresh(clearThanks: true)));
    }
    unawaited(refresh());
  }

  /// Asks what is waiting. A failure changes nothing on screen: the panic button is the
  /// elder's screen, and an error about a check-in must never stand in front of it.
  Future<void> refresh({bool clearThanks = false}) async {
    try {
      final ElderCheckIns mine = await _api.myCheckIns();
      if (_disposed) return;
      _mine = mine;
      if (clearThanks) _answer = null;
      notifyListeners();
    } on Exception {
      // Asked again on the next tick, push or reopening.
    }
  }

  /// "I am all right." One press, and it says what it did.
  Future<CheckInAnswer?> answerNow() async {
    if (_busy) return null;
    _busy = true;
    _error = null;
    notifyListeners();

    CheckInAnswer? outcome;
    try {
      outcome = await _api.answerCheckIn();
      _answer = outcome;
      await refresh();
    } on ApiException catch (failure) {
      _error = failure.message;
    } on NetworkException catch (failure) {
      _error = failure.message;
    }
    if (_disposed) return outcome;
    _busy = false;
    notifyListeners();
    return outcome;
  }

  /// The elder's yes or no to a check-in somebody else set up.
  Future<void> agree({required bool yes}) async {
    if (_busy) return;
    _busy = true;
    _error = null;
    notifyListeners();

    try {
      _mine = await _api.answerCheckInSetUp(elderId, agree: yes);
    } on ApiException catch (failure) {
      _error = failure.message;
    } on NetworkException catch (failure) {
      _error = failure.message;
    }
    if (_disposed) return;
    _busy = false;
    notifyListeners();
  }

  void dismissThanks() {
    _answer = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    _poll = null;
    // Not awaited: a cancel completes on the real clock, which a widget test never reaches.
    unawaited(_pushes?.cancel());
    _pushes = null;
    super.dispose();
  }
}
