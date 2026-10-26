import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/auth/code_sign_in_screen.dart';
import 'package:mzazicare/features/auth/sign_in_screen.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import 'support.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  /// [screen] signed out, with every request body recorded. A wrong code is answered as
  /// the server answers it.
  Future<({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth})> pump(
    WidgetTester tester,
    Widget screen, {
    AppAudience audience = AppAudience.standard,
  }) async {
    final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      final Map<String, dynamic> body = jsonDecode(request.body) as Map<String, dynamic>;
      bodies.add(body);
      if (request.url.path.endsWith('/auth/code')) return <http.Response>[http.Response('', 202)];
      if (body['code'] == '000000') {
        return <http.Response>[
          json(<String, dynamic>{
            'statusCode': 400,
            'message': 'That code is wrong or has expired. Ask for a new one.',
          }, 400),
        ];
      }
      return <http.Response>[json(sessionBody())];
    });
    final AuthController auth = AuthController(api: t.api, store: SessionStore());

    await tester.binding.setSurfaceSize(const Size(800, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: auth,
        child: MaterialApp(theme: MzaziTheme.light(audience), home: screen),
      ),
    );
    return (bodies: bodies, calls: t.calls, auth: auth);
  }

  Future<void> settle(WidgetTester tester) async {
    // Not pumpAndSettle: the resend countdown ticks every second.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('sign-in offers it to elders, and carries the typed number across', (
    WidgetTester tester,
  ) async {
    await pump(tester, const SignInScreen());
    await tester.enterText(find.widgetWithText(TextFormField, 'Phone number'), '0712 345 678');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('No password? Elders can sign in with a code instead.'), findsOneWidget);
    await tester.tap(find.text('Sign in with a code'));
    await tester.pumpAndSettle();

    expect(find.byType(CodeSignInScreen), findsOneWidget);
    expect(find.text('0712 345 678'), findsOneWidget);
  });

  testWidgets('texts a code to the number, then signs in with it', (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth}) t =
        await pump(tester, const CodeSignInScreen(number: '0712345678'));

    await tester.tap(find.text('Text me a code'));
    await settle(tester);

    expect(t.calls.single.path, '/api/v1/auth/code');
    expect(t.bodies.single, <String, dynamic>{'phone': '+254712345678'});
    // The same words whoever the number belongs to.
    expect(find.textContaining('If +254712345678 belongs to an elder'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), '123456');
    await tester.tap(find.text('Sign in'));
    await settle(tester);

    expect(t.calls.last.path, '/api/v1/auth/code/verify');
    expect(t.bodies.last, <String, dynamic>{'phone': '+254712345678', 'code': '123456'});
    expect(t.auth.isSignedIn, isTrue);
  });

  testWidgets("takes a caregiver's code without texting anything", (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth}) t =
        await pump(tester, const CodeSignInScreen(number: '0712345678'));

    await tester.tap(find.text('I have a code from my caregiver'));
    await tester.pumpAndSettle();

    expect(t.calls, isEmpty);
    expect(find.textContaining('your caregiver sees on your page'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), '000000');
    await tester.tap(find.text('Sign in'));
    await settle(tester);

    expect(t.calls.single.path, '/api/v1/auth/code/verify');
    expect(find.text('That code is wrong or has expired. Ask for a new one.'), findsOneWidget);
    expect(t.auth.isSignedIn, isFalse);
  });

  testWidgets('every control is big enough for an elder in Elder mode', (
    WidgetTester tester,
  ) async {
    await pump(tester, const CodeSignInScreen(number: '0712345678'), audience: AppAudience.elder);

    for (final String label in <String>['Text me a code', 'I have a code from my caregiver']) {
      final Finder button = find.ancestor(
        of: find.text(label),
        matching: find.byWidgetPredicate((Widget w) => w is ButtonStyleButton),
      );
      expect(
        tester.getSize(button).height,
        greaterThanOrEqualTo(MzaziA11y.elderMinTouchTarget),
        reason: label,
      );
    }
  });
}
