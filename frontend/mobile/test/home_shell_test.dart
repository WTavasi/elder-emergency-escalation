import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/home/home_shell.dart';
import 'package:mzazicare/features/responder/alerts_controller.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import 'support.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  /// The shell for [role], with one emergency nobody has answered.
  Future<void> pump(WidgetTester tester, Role role) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      if (request.url.path.endsWith('/auth/login')) return <http.Response>[json(sessionBody())];
      if (request.url.path.endsWith('/alerts')) {
        return <http.Response>[json(<Map<String, dynamic>>[summaryBody()])];
      }
      return <http.Response>[json(<Map<String, dynamic>>[])];
    });

    // Signed in, so the account tab has an account to show.
    final AuthController auth = AuthController(api: t.api, store: SessionStore());
    await auth.signIn(phone: '+254700000020', password: 'Dev!2026');

    await tester.pumpWidget(
      MultiProvider(
        providers: <ChangeNotifierProvider<ChangeNotifier>>[
          ChangeNotifierProvider<AuthController>.value(value: auth),
          ChangeNotifierProvider<AlertsController>(
            // Long enough that the poll never fires during a test.
            create: (_) => AlertsController(api: t.api, pollInterval: const Duration(hours: 1)),
          ),
        ],
        child: MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: HomeShell(api: t.api, role: role),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder inBar(String text) =>
      find.descendant(of: find.byType(NavigationBar), matching: find.text(text));

  testWidgets('a caregiver has alerts, the people they look after, and their account', (
    WidgetTester tester,
  ) async {
    await pump(tester, Role.caregiver);

    expect(inBar('Alerts'), findsOneWidget);
    expect(inBar('People'), findsOneWidget);
    expect(inBar('Me'), findsOneWidget);
  });

  testWidgets('a responder looks after nobody in particular, so has no People tab', (
    WidgetTester tester,
  ) async {
    await pump(tester, Role.emergencyResponder);

    expect(inBar('People'), findsNothing);
    expect(inBar('Me'), findsOneWidget);
  });

  testWidgets('the alerts tab carries the number nobody has answered', (
    WidgetTester tester,
  ) async {
    await pump(tester, Role.caregiver);

    expect(inBar('1'), findsOneWidget);
    expect(find.text('1 waiting for somebody'), findsOneWidget);
  });

  testWidgets('the account tab is where signing out lives now', (WidgetTester tester) async {
    await pump(tester, Role.caregiver);

    await tester.tap(inBar('Me'));
    await tester.pumpAndSettle();

    expect(find.text('Sign out'), findsOneWidget);
  });

  testWidgets('every tab is a full touch target', (WidgetTester tester) async {
    await pump(tester, Role.caregiver);

    for (final String label in <String>['Alerts', 'People', 'Me']) {
      final Finder tab = find.ancestor(
        of: inBar(label),
        matching: find.byType(NavigationDestination),
      );
      expect(
        tester.getSize(tab).height,
        greaterThanOrEqualTo(MzaziA11y.standardMinTouchTarget),
        reason: label,
      );
    }
  });
}
