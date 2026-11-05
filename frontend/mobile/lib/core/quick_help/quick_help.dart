import 'dart:async';

import 'package:flutter/services.dart';

import '../api/models.dart';

/// A request for help from outside the app's own button: "Hey Siri, MzaziCare help
/// fire", the Assistant, the home-screen widget or the quick-settings tile.
class QuickHelpRequest {
  const QuickHelpRequest({required this.from, this.type});

  /// `siri`, `assistant`, `widget` or `tile`.
  final String from;

  /// What was said with it, when something was: "help fire". Null for plain "help".
  final EmergencyType? type;

  static QuickHelpRequest? fromMap(Object? raw) {
    if (raw is! Map<Object?, Object?>) return null;
    final Object? from = raw['from'];
    if (from is! String || !_sources.contains(from)) return null;
    return QuickHelpRequest(from: from, type: EmergencyType.parse(raw['type']));
  }

  static const Set<String> _sources = <String>{'siri', 'assistant', 'widget', 'tile'};
}

/// Where the iPhone's App Shortcuts and Android's widget, tile and Assistant hand a
/// request for help to the app.
///
/// The native side opens the app and keeps the request until the app takes it, so a
/// request made while the app was closed is not lost: [takePending] on start and on
/// coming back to the front. When the app is already open, the native side only says
/// "help" and the request is taken the same way, so one request is acted on once
/// however the two race.
class QuickHelp {
  QuickHelp({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel('ke.ac.strathmore.mzazicare/quick_help') {
    _channel.setMethodCallHandler((MethodCall call) async {
      if (call.method != 'help') return;
      final QuickHelpRequest? request = await takePending();
      if (request != null && !_requests.isClosed) _requests.add(request);
    });
  }

  final MethodChannel _channel;
  final StreamController<QuickHelpRequest> _requests =
      StreamController<QuickHelpRequest>.broadcast();

  /// Requests made while the app is already open.
  Stream<QuickHelpRequest> get requests => _requests.stream;

  /// The request that opened the app, once. Null when there is none, and on a platform
  /// without the native side, such as a test.
  Future<QuickHelpRequest?> takePending() async {
    try {
      return QuickHelpRequest.fromMap(await _channel.invokeMethod<Object?>('takePending'));
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  void dispose() {
    _channel.setMethodCallHandler(null);
    unawaited(_requests.close());
  }
}
