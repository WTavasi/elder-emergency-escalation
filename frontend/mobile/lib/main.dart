import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'app.dart';
import 'auth/auth_controller.dart';
import 'auth/session_store.dart';

/// Where the API is.
///
/// Supplied at build time rather than read from a file, so a release build cannot
/// accidentally ship pointing at somebody's laptop:
///
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
///
/// The default is the Android emulator's address for the host machine. 10.0.2.2 is
/// how the emulator reaches the Mac; localhost inside the emulator is the emulator
/// itself, which is the first thing that goes wrong for everybody.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000/api/v1',
);

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

  final ApiClient api = ApiClient(baseUrl: apiBaseUrl);
  final AuthController auth = AuthController(api: api, store: SessionStore());

  unawaited(auth.restore());

  runApp(
    ChangeNotifierProvider<AuthController>.value(
      value: auth,
      child: MzaziCareApp(api: api),
    ),
  );
}
