import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/live/live_updates.dart';

/// The list of emergencies a caregiver or responder can act on.
///
/// Refreshed when the server says something changed, and polled behind that. A list
/// that refreshes on a timer is correct where a list that refreshes on an event is
/// merely faster, so the timer stays as the safety net and slows to a heartbeat while
/// the socket is up. Any change refreshes the list: a person sees only emergencies the
/// server lets them see, so every notice that reaches this phone is one of theirs.
class AlertsController extends ChangeNotifier {
  AlertsController({
    required ApiClient api,
    this.pollInterval = const Duration(seconds: 10),
    LiveUpdates? live,
  }) : _api = api {
    _live = LiveFollower(live: live, wants: (LiveChange _) => true, refresh: refresh);
  }

  final ApiClient _api;
  final Duration pollInterval;
  late final LiveFollower _live;

  List<AlertSummary> _alerts = const <AlertSummary>[];
  bool _isLoading = true;
  bool _openOnly = true;
  String? _error;
  DateTime? _updatedAt;
  Timer? _poll;
  bool _disposed = false;

  List<AlertSummary> get alerts => _alerts;

  /// True only for the first load. A refresh that fails leaves the previous list on
  /// screen, because stale information about a live emergency beats none.
  bool get isLoading => _isLoading;
  bool get openOnly => _openOnly;
  String? get error => _error;
  DateTime? get updatedAt => _updatedAt;

  /// How many are still waiting for somebody. The number the screen leads with.
  int get unansweredCount =>
      _alerts.where((AlertSummary a) => a.state.isOpen && !a.isAnswered).length;

  void start() {
    _live.start();
    unawaited(refresh());
    _poll = Timer.periodic(pollInterval, (Timer _) {
      if (_live.shouldPoll) unawaited(refresh());
    });
  }

  Future<void> setOpenOnly(bool value) async {
    if (_openOnly == value) return;
    _openOnly = value;
    _alerts = const <AlertSummary>[];
    _isLoading = true;
    _notify();
    await refresh();
  }

  Future<void> refresh() async {
    _live.asked();
    try {
      final List<AlertSummary> fetched = await _api.alerts(open: _openOnly);
      if (_disposed) return;
      _alerts = order(fetched);
      _error = null;
      _updatedAt = DateTime.now();
    } on ApiException catch (error) {
      if (_disposed) return;
      _error = error.message;
    } on NetworkException catch (error) {
      if (_disposed) return;
      _error = error.message;
    } finally {
      if (!_disposed) {
        _isLoading = false;
        _notify();
      }
    }
  }

  /// Urgency order, matching the console so the two surfaces never disagree about
  /// which emergency is the most pressing: nobody has answered it, it scores highest,
  /// it has been waiting longest.
  static List<AlertSummary> order(List<AlertSummary> alerts) {
    final List<AlertSummary> sorted = List<AlertSummary>.of(alerts);
    sorted.sort((AlertSummary a, AlertSummary b) {
      final int byOpen = _rank(b) - _rank(a);
      if (byOpen != 0) return byOpen;
      final int byScore = b.severityScore - a.severityScore;
      if (byScore != 0) return byScore;
      return a.triggeredAt.compareTo(b.triggeredAt);
    });
    return sorted;
  }

  static int _rank(AlertSummary alert) {
    if (!alert.state.isOpen) return 0;
    return alert.isAnswered ? 1 : 2;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    _live.dispose();
    super.dispose();
  }
}
