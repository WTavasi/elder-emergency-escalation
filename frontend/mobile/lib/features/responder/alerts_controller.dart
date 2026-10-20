import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show DateTimeRange, DateUtils;

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
    this.typingPause = const Duration(milliseconds: 350),
    LiveUpdates? live,
  }) : _api = api {
    _live = LiveFollower(live: live, wants: (LiveChange _) => true, refresh: refresh);
  }

  final ApiClient _api;
  final Duration pollInterval;

  /// How long typing has to pause before a search goes out, so a name typed letter by
  /// letter is one request rather than one per letter.
  final Duration typingPause;
  late final LiveFollower _live;

  List<AlertSummary> _alerts = const <AlertSummary>[];
  bool _isLoading = true;
  bool _openOnly = true;
  String? _error;
  DateTime? _updatedAt;
  Timer? _poll;
  bool _disposed = false;
  String _search = '';
  DateTimeRange? _days;
  Timer? _typing;

  /// Counts requests, so an answer that arrives after a newer request went out is
  /// dropped instead of replacing the newer one. Typing quickly makes that likely.
  int _asked = 0;

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

  /// What history is being searched for: part of the elder's name or of whoever took
  /// it on. Only history is searched; the open list is short and shows everything.
  String get search => _search;

  /// The days history is narrowed to, both ends included. Null for all of it.
  DateTimeRange? get days => _days;

  bool get isSearching => !_openOnly && (_search.isNotEmpty || _days != null);

  /// A new search, sent once typing pauses.
  void setSearch(String text) {
    final String trimmed = text.trim();
    if (trimmed == _search) return;
    _search = trimmed;
    _typing?.cancel();
    _typing = Timer(typingPause, () => unawaited(refresh()));
  }

  Future<void> setDays(DateTimeRange? range) async {
    _days = range;
    _typing?.cancel();
    await refresh();
  }

  /// Back to the whole of history.
  Future<void> clearSearch() async {
    _search = '';
    _days = null;
    _typing?.cancel();
    await refresh();
  }

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
    final int asking = ++_asked;
    final bool history = !_openOnly;
    final DateTimeRange? days = history ? _days : null;
    try {
      final List<AlertSummary> fetched = await _api.alerts(
        open: _openOnly,
        search: history ? _search : null,
        // The first moment of the first day to the last moment of the last, on this
        // phone's clock.
        from: days == null ? null : DateUtils.dateOnly(days.start),
        to: days == null
            ? null
            : DateUtils.dateOnly(days.end)
                  .add(const Duration(days: 1))
                  .subtract(const Duration(milliseconds: 1)),
      );
      if (_disposed || asking != _asked) return;
      _alerts = order(fetched);
      _error = null;
      _updatedAt = DateTime.now();
    } on ApiException catch (error) {
      if (_disposed || asking != _asked) return;
      _error = error.message;
    } on NetworkException catch (error) {
      if (_disposed || asking != _asked) return;
      _error = error.message;
    } finally {
      if (!_disposed && asking == _asked) {
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
    _typing?.cancel();
    _live.dispose();
    super.dispose();
  }
}
