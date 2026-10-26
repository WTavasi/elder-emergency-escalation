import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/api/models.dart';
import 'core/auth/auth_controller.dart';
import 'core/auth/session_store.dart';
import 'core/live/live_updates.dart';
import 'core/live/realtime_connection.dart';
import 'core/location/position_source.dart';
import 'core/location/way_there.dart';
import 'core/push/push_registration.dart';
import 'core/theme/appearance.dart';

/// Where the API is, when it was given at build time:
///
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000/api/v1
///
/// Empty when it was not, and [resolveApiBaseUrl] then picks the development default.
const String configuredApiBaseUrl = String.fromEnvironment('API_BASE_URL');

/// The address the app talks to.
///
/// An explicit API_BASE_URL always wins. Without one, the default depends on where the
/// app is running, because the host machine has a different address from each:
///
/// * the Android emulator reaches the Mac at 10.0.2.2; localhost there is the
///   emulator itself;
/// * the iOS Simulator shares the Mac's network, so localhost is the Mac.
///
/// The default used to be 10.0.2.2 everywhere. On the iOS Simulator that address leads
/// nowhere, so a plain `flutter run` waited out the full twelve seconds and failed sign
/// in with a timeout while the API and the console were working perfectly.
///
/// A real phone is neither, and still needs the Mac's Wi-Fi address passed in; see
/// "On a real phone" in the README.
String resolveApiBaseUrl({String configured = configuredApiBaseUrl, TargetPlatform? platform}) {
  if (configured.isNotEmpty) return configured;
  final TargetPlatform target = platform ?? defaultTargetPlatform;
  final String host = target == TargetPlatform.android ? '10.0.2.2' : 'localhost';
  return 'http://$host:3000/api/v1';
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final String baseUrl = resolveApiBaseUrl();
  final ApiClient api = ApiClient(baseUrl: baseUrl);
  final AuthController auth = AuthController(api: api, store: SessionStore());

  // Both follow the session: opened, swapped or closed as people sign in, tokens
  // rotate and people sign out. Neither is in the way of anything. With no socket the
  // screens poll as they always have, and with no Firebase project the app never asks
  // for notification permission.
  final LiveUpdates live = LiveUpdates();
  final RealtimeConnection realtime = RealtimeConnection(
    url: realtimeUrlFor(baseUrl),
    live: live,
    // One ordinary request renews the tokens when the socket was refused for an
    // expired one; the new session then reopens the socket through the listener below.
    onRejected: () async {
      if (auth.isSignedIn) await api.me();
    },
  );
  final PushRegistration push = PushRegistration(api: api, live: live);

  // Only for people who respond. An elder's account never reads the preference, and
  // their phone is never asked where it is.
  final WayThere wayThere = WayThere(api: api, source: const DevicePositionSource());

  void followSession() {
    realtime.follow(auth.session);
    unawaited(push.follow(auth.session));
    final Account? account = auth.account;
    unawaited(wayThere.follow(account != null && account.role.responds ? account.id : null));
  }

  auth.addListener(followSession);
  unawaited(auth.restore());

  // Light or dark, if the person chose one; the phone's setting until it is read.
  final AppearanceController appearance = AppearanceController();
  unawaited(appearance.load());

  runApp(
    Provider<LiveUpdates>.value(
      value: live,
      child: ChangeNotifierProvider<AppearanceController>.value(
        value: appearance,
        child: ChangeNotifierProvider<WayThere>.value(
          value: wayThere,
          child: ChangeNotifierProvider<AuthController>.value(
            value: auth,
            child: MzaziCareApp(api: api),
          ),
        ),
      ),
    ),
  );
}
