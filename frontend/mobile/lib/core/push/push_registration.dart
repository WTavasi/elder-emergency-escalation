import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../live/live_updates.dart';
import 'firebase_config.dart';

/// What the app needs from a push service, so the registration logic can be tested
/// without one.
abstract class PushTransport {
  /// Starts the service and asks the person for permission. False when push is not
  /// available in this build or the person said no.
  Future<bool> start();

  /// This device's address for push messages.
  Future<String?> token();

  /// A new address, when the service rotates it.
  Stream<String> get tokenRefreshes;

  /// The data of each message that arrives, while the app is in front, or that the
  /// person tapped to open it.
  Stream<Map<String, dynamic>> get messages;
}

/// Tells the server where to reach this phone, for whoever is signed in.
///
/// The server keeps one address per account, and moves an address that another account
/// held to this one, so a phone handed from one person to another never carries the
/// first person's emergencies. Signing out clears it on the server, so there is nothing
/// to undo here.
class PushRegistration {
  PushRegistration({required ApiClient api, required LiveUpdates live, PushTransport? transport})
    : _api = api,
      _live = live,
      _transport = transport ?? FirebasePushTransport();

  final ApiClient _api;
  final LiveUpdates _live;
  final PushTransport _transport;

  Future<bool>? _started;
  String? _registeredFor;
  StreamSubscription<String>? _refreshes;
  StreamSubscription<Map<String, dynamic>>? _messages;

  /// Registers this phone for [session]'s account, once per account. A rotated access
  /// token is the same account and changes nothing.
  Future<void> follow(Session? session) async {
    final String? accountId = session?.account.id;
    if (accountId == _registeredFor) return;
    _registeredFor = accountId;
    if (accountId == null) return;

    final bool available = await (_started ??= _start());
    if (!available || _registeredFor != accountId) return;

    final String? token = await _transport.token();
    if (token != null && _registeredFor == accountId) await _register(token);
  }

  Future<bool> _start() async {
    final bool available = await _transport.start();
    if (!available) return false;

    _refreshes = _transport.tokenRefreshes.listen((String token) {
      if (_registeredFor != null) unawaited(_register(token));
    });
    // A push that arrives while the app is open is the same news the socket brings,
    // and sometimes it gets here first. A check-in has no emergency to point at, so it
    // goes to the elder's screen on its own.
    _messages = _transport.messages.listen(_live.publishPush);
    return true;
  }

  Future<void> _register(String token) async {
    try {
      await _api.registerPushToken(token);
    } on Exception catch (error) {
      // Not fatal. SMS and the call still reach this person, and the next launch or
      // token rotation tries again.
      debugPrint('Push registration failed: $error');
      _registeredFor = null;
    }
  }

  void dispose() {
    unawaited(_refreshes?.cancel());
    unawaited(_messages?.cancel());
  }
}

/// Firebase Cloud Messaging, started only when this build was given a project.
class FirebasePushTransport implements PushTransport {
  FirebasePushTransport({FirebaseConfig config = const FirebaseConfig.fromEnvironment()})
    : _config = config;

  final FirebaseConfig _config;

  @override
  Future<bool> start() async {
    final FirebaseOptions? options = _config.optionsFor(defaultTargetPlatform);
    if (options == null) return false;

    try {
      await Firebase.initializeApp(options: options);
      final NotificationSettings settings = await FirebaseMessaging.instance.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return false;

      // iOS shows nothing for a message that arrives while the app is open unless told
      // to. An emergency is worth interrupting for.
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        sound: true,
      );
      return true;
    } on Exception catch (error) {
      debugPrint('Push unavailable: $error');
      return false;
    }
  }

  @override
  Future<String?> token() async {
    try {
      return await FirebaseMessaging.instance.getToken();
    } on Exception catch (error) {
      // iOS without an APNs key lands here, as does a phone without Play services.
      debugPrint('No push token: $error');
      return null;
    }
  }

  @override
  Stream<String> get tokenRefreshes => FirebaseMessaging.instance.onTokenRefresh;

  @override
  Stream<Map<String, dynamic>> get messages {
    final StreamController<Map<String, dynamic>> merged = StreamController<Map<String, dynamic>>();
    final List<StreamSubscription<RemoteMessage>> sources = <StreamSubscription<RemoteMessage>>[
      FirebaseMessaging.onMessage.listen((RemoteMessage m) => merged.add(m.data)),
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage m) => merged.add(m.data)),
    ];
    // The tap that launched the app from closed arrives once, here, and not above.
    unawaited(
      FirebaseMessaging.instance.getInitialMessage().then((RemoteMessage? m) {
        if (m != null && !merged.isClosed) merged.add(m.data);
      }),
    );
    merged.onCancel = () async {
      for (final StreamSubscription<RemoteMessage> source in sources) {
        await source.cancel();
      }
      await merged.close();
    };
    return merged.stream;
  }
}
