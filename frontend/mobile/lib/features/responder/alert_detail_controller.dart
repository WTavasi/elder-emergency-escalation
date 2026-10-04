import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';

/// One emergency, and the four things a person can do about it.
///
/// Every action follows the same shape: mark busy, call, refetch, publish. The refetch
/// is deliberate rather than lazy. The server's answer to an acknowledgement is the
/// event row, but acting on an emergency changes more than that row: it cancels timers,
/// writes the trail, and can move the emergency to a tier this screen has not seen. So
/// the screen re-reads the projection instead of patching its copy from the response,
/// and never shows a state the server did not confirm.
class AlertDetailController extends ChangeNotifier {
  AlertDetailController({
    required ApiClient api,
    required this.eventId,
    this.pollInterval = const Duration(seconds: 8),
  }) : _api = api;

  final ApiClient _api;
  final String eventId;
  final Duration pollInterval;

  AlertDetail? _detail;
  bool _isLoading = true;
  bool _isWorking = false;
  String? _loadError;
  String? _actionError;
  String? _confirmation;
  Timer? _poll;
  bool _disposed = false;

  AlertDetail? get detail => _detail;
  bool get isLoading => _isLoading;

  /// True while an action is in flight. Every control reads this, so one press cannot
  /// become two and two different actions cannot overlap.
  bool get isWorking => _isWorking;
  String? get loadError => _loadError;

  /// Why the last action failed. Separate from [loadError] because a failed action is
  /// the person's business and a failed refresh mostly is not.
  String? get actionError => _actionError;

  /// What just succeeded, announced once.
  String? get confirmation => _confirmation;

  void start() {
    unawaited(refresh());
    _poll = Timer.periodic(pollInterval, (Timer _) {
      // A refresh landing mid-action would replace what the person is looking at with
      // the state from before their press.
      if (!_isWorking) unawaited(refresh());
    });
  }

  Future<void> refresh() async {
    try {
      final AlertDetail fetched = await _api.alertDetail(eventId);
      if (_disposed) return;
      _detail = fetched;
      _loadError = null;
    } on ApiException catch (error) {
      if (_disposed) return;
      _loadError = error.message;
    } on NetworkException catch (error) {
      if (_disposed) return;
      _loadError = error.message;
    } finally {
      if (!_disposed) {
        _isLoading = false;
        notifyListeners();
      }
    }
  }

  Future<void> acknowledge() =>
      _act(() => _api.acknowledge(eventId), 'You are marked as responding.');

  Future<void> decline({String? reason}) => _act(
    () => _api.decline(eventId, reason: reason),
    'Recorded. The emergency will not wait on you.',
  );

  Future<void> resolve(Outcome outcome, {String? note}) => _act(
    () => _api.resolve(eventId, outcome, note: note),
    'Closed as ${outcome.label.toLowerCase()}.',
  );

  Future<void> requestResponder() =>
      _act(() => _api.requestResponder(eventId), 'An emergency responder has been requested.');

  /// True when this emergency is still live and nobody has taken it, which is the only
  /// moment acknowledging or declining makes sense.
  bool get isUnanswered {
    final AlertDetail? current = _detail;
    return current != null && current.summary.state.isOpen && !current.summary.isAnswered;
  }

  Future<void> _act(Future<void> Function() call, String success) async {
    if (_isWorking) return;
    _isWorking = true;
    _actionError = null;
    _confirmation = null;
    notifyListeners();

    try {
      await call();
      if (_disposed) return;
      _confirmation = success;
      await refresh();
    } on ApiException catch (error) {
      if (_disposed) return;
      // A 409 here is not a fault. It is somebody else having answered first, which is
      // the system working, so the message the server wrote is shown as it stands.
      _actionError = error.message;
    } on NetworkException catch (error) {
      if (_disposed) return;
      _actionError = error.message;
    } finally {
      if (!_disposed) {
        _isWorking = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    super.dispose();
  }
}
