import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/elder/elder_me_screen.dart';
import 'package:provider/provider.dart';

import 'support.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  Future<({AuthController auth, List<Exchange> calls})> pump(WidgetTester tester) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int index) => <http.Response>[
        index == 0 ? json(sessionBody()) : http.Response('', 204),
      ],
    );
    final AuthController auth = AuthController(api: t.api, store: SessionStore());
    await auth.signIn(phone: '+254700000010', password: 'Dev!2026');

    await tester.binding.setSurfaceSize(const Size(800, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: auth,
        child: MaterialApp(
          theme: MzaziTheme.light(AppAudience.elder),
          home: ElderMeScreen(api: t.api),
        ),
      ),
    );
    return (auth: auth, calls: t.calls);
  }

  testWidgets('shows whose phone this is', (WidgetTester tester) async {
    await pump(tester);

    expect(find.text('Grace Wanjiru'), findsOneWidget);
    expect(find.text('+254700000010'), findsOneWidget);
    expect(find.text('Privacy and consent'), findsOneWidget);
  });

  testWidgets('asks before signing out, and staying changes nothing', (WidgetTester tester) async {
    final ({AuthController auth, List<Exchange> calls}) t = await pump(tester);

    await tester.tap(find.text('Sign out of this phone'));
    await tester.pumpAndSettle();

    expect(find.text('Sign out of this phone?'), findsOneWidget);
    await tester.tap(find.text('Stay signed in'));
    await tester.pumpAndSettle();

    expect(t.auth.isSignedIn, isTrue);
    expect(t.calls.where((Exchange c) => c.path.endsWith('/auth/logout')), isEmpty);
  });

  testWidgets('signs out once the elder says so', (WidgetTester tester) async {
    final ({AuthController auth, List<Exchange> calls}) t = await pump(tester);

    await tester.tap(find.text('Sign out of this phone'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(t.auth.isSignedIn, isFalse);
    expect(t.calls.where((Exchange c) => c.path.endsWith('/auth/logout')), hasLength(1));
  });
}
