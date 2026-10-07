import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/auth/auth_controller.dart';
import 'core/auth/session_store.dart';

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

/// Registers the font licences with Flutter's own licence page.
///
/// The Open Font Licence requires the licence to travel with the font, and a font bundled
/// into an app is a distribution of it. Having the text sitting in the repository does not
/// satisfy that; this puts it in front of whoever opens the app's licences.
void _registerFontLicences() {
  LicenseRegistry.addLicense(() async* {
    for (final (String name, String path) in <(String, String)>[
      ('Atkinson Hyperlegible', 'assets/fonts/OFL-AtkinsonHyperlegible.txt'),
      ('Source Sans 3', 'assets/fonts/OFL-SourceSans3.txt'),
      ('IBM Plex Mono', 'assets/fonts/OFL-IBMPlexMono.txt'),
    ]) {
      final String text = await rootBundle.loadString(path);
      yield LicenseEntryWithLineBreaks(<String>[name], text);
    }
  });
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  _registerFontLicences();

  final ApiClient api = ApiClient(baseUrl: resolveApiBaseUrl());
  final AuthController auth = AuthController(api: api, store: SessionStore());

  unawaited(auth.restore());

  runApp(
    ChangeNotifierProvider<AuthController>.value(
      value: auth,
      child: MzaziCareApp(api: api),
    ),
  );
}
