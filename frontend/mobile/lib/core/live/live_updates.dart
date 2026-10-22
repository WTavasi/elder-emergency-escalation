import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

/// One emergency changed somewhere, and a screen showing it should look again.
///
/// Deliberately thin. The socket snapshot carries more than this, and a push carries
/// less, but neither is what a screen shows: every screen re-reads its own projection
/// from the API, which applies the disclosure rules for whoever is asking. A change
/// notice only says when to look, never what to show.
@immutable
class LiveChange {
  const LiveChange({required this.eventId, this.elderlyId, this.state});

  final String eventId;
  final String? elderlyId;
  final String? state;

  /// Reads a socket snapshot or a push data payload. Both name the emergency as
  /// `eventId`. Anything else that arrives is ignored rather than trusted.
  static LiveChange? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final Object? id = raw['eventId'];
    if (id is! String || id.isEmpty) return null;
    final Object? elder = raw['elderlyId'];
    final Object? state = raw['state'];
    return LiveChange(
      eventId: id,
      elderlyId: elder is String ? elder : null,
      state: state is String ? state : null,
    );
  }
}

/// Where change notices meet the screens that care about them.
///
/// Two things feed it: the realtime socket while the app is open, and a push message
/// that arrives while the app is in the foreground. Screens do not know or care which
/// one spoke. They keep polling as a safety net, slower while the socket is up, at the
/// old pace when it is not, so a dropped connection costs speed and never correctness.
class LiveUpdates {
  final StreamController<LiveChange> _changes = StreamController<LiveChange>.broadcast();
  final StreamController<void> _checkIns = StreamController<void>.broadcast();
  bool _connected = false;

  Stream<LiveChange> get changes => _changes.stream;

  /// A daily check-in was just asked. Carries nothing: the elder's screen asks the API
  /// what is waiting, the same as when it opens.
  Stream<void> get checkIns => _checkIns.stream;

  /// Whether the socket is up right now. Only the socket sets this; a push arriving
  /// says nothing about whether the next one will.
  bool get isConnected => _connected;

  void publish(LiveChange change) {
    if (!_changes.isClosed) _changes.add(change);
  }

  void checkInAsked() {
    if (!_checkIns.isClosed) _checkIns.add(null);
  }

  /// Routes a push data payload: a check-in, or a change to an emergency.
  void publishPush(Map<String, dynamic> data) {
    if (data['type'] == 'check-in') {
      checkInAsked();
      return;
    }
    final LiveChange? change = LiveChange.tryParse(data);
    if (change != null) publish(change);
  }

  void connectionChanged(bool connected) => _connected = connected;

  void dispose() {
    unawaited(_changes.close());
    unawaited(_checkIns.close());
  }

  /// The app's hub, or none where a screen is built on its own, as in a widget test.
  /// None behaves exactly as the app did before live updates: polling at full pace.
  static LiveUpdates? maybeOf(BuildContext context) {
    try {
      return Provider.of<LiveUpdates>(context, listen: false);
    } on ProviderNotFoundException {
      return null;
    }
  }
}

/// The part every watching controller shares: follow the change notices that concern
/// it, fold a burst of them into one refresh, and tell the poll when it can rest.
class LiveFollower {
  LiveFollower({
    required this.live,
    required this.wants,
    required this.refresh,
    this.fallback = const Duration(seconds: 30),
    this.settle = const Duration(milliseconds: 250),
  });

  final LiveUpdates? live;
  final bool Function(LiveChange change) wants;
  final Future<void> Function() refresh;

  /// The longest a screen goes without asking while the socket is up. A notice can be
  /// lost (a socket that reconnects misses what happened while it was away), so the
  /// poll never stops, it only slows down.
  final Duration fallback;

  /// How long to wait for the rest of a burst. An escalation can produce several
  /// changes in the same second, and each one is a request if they are not folded.
  final Duration settle;

  StreamSubscription<LiveChange>? _subscription;
  Timer? _settling;
  DateTime? _lastAsked;

  void start() {
    _subscription ??= live?.changes.listen((LiveChange change) {
      if (!wants(change)) return;
      _settling?.cancel();
      _settling = Timer(settle, () {
        _settling = null;
        unawaited(refresh());
      });
    });
  }

  /// Called by the controller every time it asks the server, by whatever route.
  void asked() => _lastAsked = DateTime.now();

  /// Whether a poll tick should go ahead. Always, without a socket.
  bool get shouldPoll {
    if (live?.isConnected != true) return true;
    final DateTime? last = _lastAsked;
    return last == null || DateTime.now().difference(last) >= fallback;
  }

  void dispose() {
    _settling?.cancel();
    unawaited(_subscription?.cancel());
    _subscription = null;
  }
}
