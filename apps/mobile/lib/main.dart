import 'dart:async';

import 'package:flutter/material.dart';
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

void main() {
  WidgetsFlutterBinding.ensureInitialized();

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
