import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';

/// Where the elder's screen is in the emergency.
enum AlertPhase {
  /// Nothing has happened. The panic control is the whole screen.
  idle,

  /// The request is in flight. The control is disabled so it cannot be sent twice.
  raising,

  /// Raised, and still inside the window in which it can be withdrawn.
  cancellable,

  /// Raised, past the window. Help is coming and the screen says who has it.
  live,

  /// Withdrawn by the elder.
  cancelled,

  /// Finished.
  closed,
}

/// The elder's side of one emergency.
///
/// Two rules shape everything here. Raising must never be blocked by something
/// optional, and it must never happen twice from one press. Everything else, the
/// countdown, the status polling, the wording, is comfort around those two.
class AlertController extends ChangeNotifier {
  AlertController({
    required ApiClient api,
    required GeoPoint? home,
    this.cancelWindow = const Duration(seconds: 10),
    this.pollInterval = const Duration(seconds: 5),
  })  : _api = api,
        _home = home;

  final ApiClient _api;
  final GeoPoint? _home;

  /// How long the elder has to withdraw. Matches CANCEL_GRACE_WINDOW on the server,
  /// which is the authority: this copy only decides how long the button is shown, and
  /// the server decides whether a cancellation is accepted.
  final Duration cancelWindow;
  final Duration pollInterval;

  AlertPhase _phase = AlertPhase.idle;
  Emergency? _emergency;
  String? _error;
  int _secondsLeft = 0;
  Timer? _countdown;
  Timer? _poll;

  AlertPhase get phase => _phase;
  Emergency? get emergency => _emergency;
  String? get error => _error;
  int get secondsLeft => _secondsLeft;

  /// Whether the panic control should accept a press.
  bool get canRaise => _phase == AlertPhase.idle || _phase == AlertPhase.cancelled || _phase == AlertPhase.closed;

  /// Whether this app can raise an alert at all. False only if the account has no
  /// registered home and no other location source, which is a setup fault rather than
  /// something the elder can fix in the moment, so it is surfaced before the press.
  bool get canReportLocation => _home != null;

  Future<void> raise() async {
    if (!canRaise) return;

    final GeoPoint? at = _home;
    if (at == null) {
      _error = 'This account has no registered home address, so help cannot be sent yet. '
          'Ask your caregiver to add it.';
      notifyListeners();
      return;
    }

    _phase = AlertPhase.raising;
    _error = null;
    notifyListeners();

    try {
      _emergency = await _api.raiseAlert(at);
      _startCancelWindow();
    } on ApiException catch (failure) {
      _phase = AlertPhase.idle;
      _error = failure.message;
      notifyListeners();
    } on NetworkException catch (failure) {
      _phase = AlertPhase.idle;
      _error = failure.message;
      notifyListeners();
    }
  }

  Future<void> cancel() async {
    final Emergency? raised = _emergency;
    if (raised == null || _phase != AlertPhase.cancellable) return;

    // Stopped first. A countdown that reached zero while the request was in flight
    // would move the screen to "help is coming" underneath a cancellation that is
    // about to succeed.
    _stopTimers();

    try {
      _emergency = await _api.cancelAlert(raised.id);
      _phase = AlertPhase.cancelled;
      _error = null;
    } on ApiException catch (failure) {
      // The window closed while the request was travelling, most likely. The
      // emergency stands, and saying so is more honest than offering the button again.
      _phase = AlertPhase.live;
      _error = failure.message;
      _startPolling();
    } on NetworkException catch (failure) {
      _phase = AlertPhase.live;
      _error = failure.message;
      _startPolling();
    }
    notifyListeners();
  }

  /// Back to the panic control after a cancellation or a resolved emergency.
  void reset() {
    _stopTimers();
    _phase = AlertPhase.idle;
    _emergency = null;
    _error = null;
    notifyListeners();
  }

  void _startCancelWindow() {
    _phase = AlertPhase.cancellable;
    _secondsLeft = cancelWindow.inSeconds;
    notifyListeners();

    _countdown = Timer.periodic(const Duration(seconds: 1), (Timer timer) {
      _secondsLeft -= 1;
      if (_secondsLeft <= 0) {
        timer.cancel();
        _countdown = null;
        _phase = AlertPhase.live;
        _startPolling();
      }
      notifyListeners();
    });
  }

  /// Polling, not a socket, and deliberately so at this stage.
  ///
  /// The elder's screen needs one fact: has somebody taken this on. A five second poll
  /// answers that, costs one small request, and cannot leave the screen silently stale
  /// because a socket dropped while the phone was in a pocket. The caregiver and
  /// responder screens, which watch many emergencies at once, are where a socket earns
  /// its complexity.
  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(pollInterval, (Timer _) => _refresh());
    unawaited(_refresh());
  }

  Future<void> _refresh() async {
    final Emergency? raised = _emergency;
    if (raised == null) return;

    try {
      final Emergency latest = await _api.alert(raised.id);
      _emergency = latest;
      if (!latest.state.isOpen) {
        _stopTimers();
        _phase = latest.state == EventState.cancelled ? AlertPhase.cancelled : AlertPhase.closed;
      }
      notifyListeners();
    } on Exception {
      // A failed poll changes nothing on screen. The emergency is with the server and
      // the people it notified, not with this phone, and an error banner over "help is
      // coming" would frighten somebody for no reason they can act on.
    }
  }

  void _stopTimers() {
    _countdown?.cancel();
    _countdown = null;
    _poll?.cancel();
    _poll = null;
  }

  @override
  void dispose() {
    _stopTimers();
    super.dispose();
  }
}
