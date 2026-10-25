import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/live/live_updates.dart';

/// Where the elder's screen is in the emergency.
enum AlertPhase {
  /// Nothing has happened. The panic control is the whole screen.
  idle,

  /// The request is in flight. The control is disabled so it cannot be sent twice.
  raising,

  /// The press could not reach MzaziCare. The screen offers other ways to ask, texting
  /// and calling, while the alert is tried again in the background.
  unreachable,

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
    this.cancelWindow = const Duration(seconds: 10),
    this.pollInterval = const Duration(seconds: 5),
    this.retryInterval = const Duration(seconds: 15),
    LiveUpdates? live,
  }) : _api = api {
    _live = LiveFollower(
      live: live,
      wants: (LiveChange change) => change.eventId == _emergency?.id,
      refresh: _refresh,
    )..start();
  }

  final ApiClient _api;

  /// How long the elder has to withdraw. Matches CANCEL_GRACE_WINDOW on the server,
  /// which is the authority: this copy only decides how long the button is shown, and
  /// the server decides whether a cancellation is accepted.
  final Duration cancelWindow;
  final Duration pollInterval;

  /// How often an alert that could not be sent is tried again.
  final Duration retryInterval;
  late final LiveFollower _live;

  AlertPhase _phase = AlertPhase.idle;
  Emergency? _emergency;
  String? _error;
  int _secondsLeft = 0;
  Timer? _countdown;
  Timer? _poll;
  Timer? _retry;
  bool _retrying = false;
  bool _disposed = false;

  AlertPhase get phase => _phase;
  Emergency? get emergency => _emergency;
  String? get error => _error;
  int get secondsLeft => _secondsLeft;

  /// Whether the panic control should accept a press.
  bool get canRaise =>
      _phase == AlertPhase.idle || _phase == AlertPhase.cancelled || _phase == AlertPhase.closed;

  /// Picks up an emergency that is still open, after signing back in or reopening the
  /// app. The emergency lives on the server, not on this phone, so signing out never
  /// ended it; the screen used to forget it anyway and show the help button again,
  /// which told an elder whose help was on its way that nothing was happening.
  ///
  /// Shown as help coming, never as the countdown: by the time somebody has signed out
  /// and back in, the window to withdraw has almost certainly passed, and the server
  /// decides that anyway. Does nothing if a press has already started in the meantime.
  Future<void> resume() async {
    // Back in front with an alert still waiting to be sent: the connection may be back.
    if (_phase == AlertPhase.unreachable) return _tryAgain();

    try {
      final List<AlertSummary> open = await _api.alerts(open: true, limit: 1);
      if (_disposed || open.isEmpty || _phase != AlertPhase.idle) return;

      final Emergency latest = await _api.alert(open.first.eventId);
      if (_disposed || _phase != AlertPhase.idle || !latest.state.isOpen) return;

      _emergency = latest;
      _phase = AlertPhase.live;
      notifyListeners();
      _startPolling();
    } on Exception {
      // Nothing to pick up, or no way to ask right now. The help button stays, which is
      // the right fallback: pressing it reaches the server either way.
    }
  }

  /// [resume] without waiting, for a provider's create callback.
  void resumeLater() => unawaited(resume());

  /// Looks again now, for a change this phone caused some other way: answering the
  /// check-in that raised this alert withdraws it.
  Future<void> checkNow() => _refresh();

  Future<void> raise() async {
    if (!canRaise) return;

    // Nothing is checked before the request goes out. There used to be a location
    // precondition here, and it could disable the panic control for an account whose
    // home address had never been filled in. Refusing to call for help because a
    // profile is incomplete is the wrong failure, and the server no longer needs the
    // location from this side anyway.
    _phase = AlertPhase.raising;
    _error = null;
    notifyListeners();

    try {
      _emergency = await _api.raiseAlert();
      _startCancelWindow();
    } on ApiException catch (failure) {
      _phase = AlertPhase.idle;
      _error = failure.message;
      notifyListeners();
    } on NetworkException {
      _becomeUnreachable();
    }
  }

  /// The press did not reach the server, which on a phone means no data or no signal.
  ///
  /// The help button is not offered again, because pressing it again would fail the same
  /// way and teach the elder that the button does not work. The screen offers texting and
  /// calling instead, and the alert is tried again in the background, so that the moment
  /// a connection comes back the chain starts as if the press had just happened.
  void _becomeUnreachable() {
    _phase = AlertPhase.unreachable;
    _error = null;
    notifyListeners();
    _retry?.cancel();
    _retry = Timer.periodic(retryInterval, (Timer _) => unawaited(_tryAgain()));
  }

  /// One more attempt at an alert that could not be sent.
  ///
  /// Looks for an open emergency first. The elder may have texted HELP meanwhile, which
  /// raises one on the server, and a second from here would ask everybody twice.
  Future<void> _tryAgain() async {
    if (_retrying || _phase != AlertPhase.unreachable) return;
    _retrying = true;
    try {
      final List<AlertSummary> open = await _api.alerts(open: true, limit: 1);
      if (_disposed || _phase != AlertPhase.unreachable) return;
      if (open.isNotEmpty) {
        final Emergency latest = await _api.alert(open.first.eventId);
        if (_disposed || _phase != AlertPhase.unreachable) return;
        if (latest.state.isOpen) {
          _stopRetrying();
          _emergency = latest;
          _phase = AlertPhase.live;
          notifyListeners();
          _startPolling();
          return;
        }
      }

      final Emergency raised = await _api.raiseAlert();
      if (_disposed) return;
      // Raised, even if "stop trying" was pressed while the request was travelling: an
      // emergency now exists, and the elder is shown it with the usual chance to stop it
      // rather than left not knowing their family has been told.
      _stopRetrying();
      _emergency = raised;
      _startCancelWindow();
    } on ApiException catch (failure) {
      // The server was reached and said no, so trying again will not help. Back to the
      // button, with the reason, which is the same as a refused first press.
      if (_disposed || _phase != AlertPhase.unreachable) return;
      _stopRetrying();
      _phase = AlertPhase.idle;
      _error = failure.message;
      notifyListeners();
    } on NetworkException {
      // Still no connection. The next tick tries again.
    } finally {
      _retrying = false;
    }
  }

  /// The elder no longer needs the alert sent: they reached somebody another way, or
  /// pressed by mistake. Back to the help button.
  void stopTrying() {
    if (_phase != AlertPhase.unreachable) return;
    _stopRetrying();
    _phase = AlertPhase.idle;
    notifyListeners();
  }

  void _stopRetrying() {
    _retry?.cancel();
    _retry = null;
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

  /// The socket first, the poll behind it.
  ///
  /// The elder's screen needs one fact: has somebody taken this on. The socket brings
  /// that the moment it happens. The poll stays, slowed to a heartbeat while the socket
  /// is up, because a socket can drop while the phone is in a pocket and the screen must
  /// never sit on "help is coming" after help has arrived.
  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(pollInterval, (Timer _) {
      if (_live.shouldPoll) unawaited(_refresh());
    });
    unawaited(_refresh());
  }

  Future<void> _refresh() async {
    final Emergency? raised = _emergency;
    if (raised == null) return;
    _live.asked();

    try {
      final Emergency latest = await _api.alert(raised.id);
      if (_disposed) return;
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
    _stopRetrying();
  }

  @override
  void dispose() {
    _disposed = true;
    _stopTimers();
    _live.dispose();
    super.dispose();
  }
}
