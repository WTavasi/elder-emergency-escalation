import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/auth/sign_up_screen.dart';
import 'package:provider/provider.dart';

import 'support.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  // A real face, so the test of what fits across a phone measures real text.
  setUpAll(loadRealFaces);

  /// The sign-up screen pushed over a page, as it is in the app, with every request
  /// body recorded.
  Future<({List<Map<String, dynamic>> bodies, List<Exchange> calls})> pump(
    WidgetTester tester,
  ) async {
    final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      if (request.body.isNotEmpty) bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return <http.Response>[
        if (request.url.path.endsWith('/verify-phone'))
          http.Response('', 202)
        else
          json(sessionBody(), 201),
      ];
    });
    final AuthController auth = AuthController(api: t.api, store: SessionStore());

    await tester.binding.setSurfaceSize(const Size(800, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: auth,
        child: MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: Builder(
            builder: (BuildContext context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => Navigator.of(context)
                      .push<void>(MaterialPageRoute<void>(builder: (_) => const SignUpScreen())),
                  child: const Text('Sign in page'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Sign in page'));
    await tester.pumpAndSettle();
    return (bodies: bodies, calls: t.calls);
  }

  Future<void> fillDetails(WidgetTester tester) async {
    await tester.enterText(find.widgetWithText(TextFormField, 'Your name'), 'Mary Otieno');
    await tester.enterText(find.widgetWithText(TextFormField, 'Your phone number'), '0712 345 678');
  }

  Future<void> sendAndWait(WidgetTester tester) async {
    await tester.tap(find.text('Agree and send a code'));
    // Not pumpAndSettle: the resend countdown ticks every second, and settling would
    // run it down to zero before the assertions after it could see it.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  Future<void> finish(WidgetTester tester) async {
    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), '123456');
    await tester.enterText(find.widgetWithText(TextFormField, 'Choose a password'), 'Dev!2026x');
    await tester.tap(find.text('Create my account'));
    await tester.pumpAndSettle();
  }

  testWidgets('asks only for who you are and your number first', (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls}) t = await pump(tester);

    expect(find.text('STEP 1 OF 2'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Your name'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Your phone number'), findsOneWidget);
    // An email is added later on the account page, and the password comes with the code.
    expect(find.textContaining('Email'), findsNothing);
    expect(find.textContaining('assword'), findsNothing);
    expect(find.byType(Checkbox), findsNothing);

    // Nothing is sent until the details are there.
    await tester.tap(find.text('Agree and send a code'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your name.'), findsOneWidget);
    expect(t.calls, isEmpty);
  });

  testWidgets('says what the button agrees to, with the terms and the notice one tap away', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    expect(find.textContaining('By continuing you agree to the terms of use'), findsOneWidget);

    await tester.tapOnText(find.textRange.ofSubstring('privacy notice'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Privacy notice'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tapOnText(find.textRange.ofSubstring('terms of use'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Terms of use'), findsOneWidget);
  });

  testWidgets('sends the number in international format, then signs up with the code', (
    WidgetTester tester,
  ) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls}) t = await pump(tester);
    await fillDetails(tester);
    await sendAndWait(tester);

    expect(t.calls.single.path, '/api/v1/auth/verify-phone');
    expect(t.bodies.single, <String, dynamic>{'phone': '+254712345678'});
    expect(find.text('STEP 2 OF 2'), findsOneWidget);
    expect(find.text('Check your messages'), findsOneWidget);
    // The resend button waits out the server's own cooldown.
    expect(find.textContaining('Send a new code in'), findsOneWidget);

    await finish(tester);

    expect(t.calls.last.path, '/api/v1/auth/register');
    expect(t.bodies.last, <String, dynamic>{
      'name': 'Mary Otieno',
      'phone': '+254712345678',
      'code': '123456',
      'password': 'Dev!2026x',
      'role': 'CAREGIVER',
      'acceptedPrivacyNotice': true,
    });
    // Signed in, so the screen gets out of the way of the home screen beneath it.
    expect(find.byType(SignUpScreen), findsNothing);
  });

  testWidgets('shows the password on request rather than asking for it twice', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    await fillDetails(tester);
    await sendAndWait(tester);

    TextField password() => tester.widget<TextField>(
      find.descendant(
        of: find.widgetWithText(TextFormField, 'Choose a password'),
        matching: find.byType(TextField),
      ),
    );
    expect(password().obscureText, isTrue);
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(password().obscureText, isFalse);
    expect(find.byTooltip('Hide password'), findsOneWidget);
  });

  testWidgets('back from the code goes to the first step, with the details kept', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    await fillDetails(tester);
    await sendAndWait(tester);

    await tester.pageBack();
    await tester.pump();

    expect(find.text('STEP 1 OF 2'), findsOneWidget);
    expect(find.text('Mary Otieno'), findsOneWidget);
    expect(find.byType(SignUpScreen), findsOneWidget);
  });

  testWidgets('a family member signs up as one', (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls}) t = await pump(tester);
    await tester.tap(find.text('Family'));
    await fillDetails(tester);
    await sendAndWait(tester);
    await finish(tester);

    expect(t.bodies.last['role'], 'FAMILY_MEMBER');
  });

  testWidgets('a community volunteer signs up as one', (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls}) t = await pump(tester);
    await tester.tap(find.text('Volunteer'));
    await tester.pump();
    expect(find.textContaining('nobody asks you anything until an administrator'), findsOneWidget);
    await fillDetails(tester);
    await sendAndWait(tester);
    await finish(tester);

    expect(t.bodies.last['role'], 'COMMUNITY_RESPONDER');
  });

  testWidgets('the three roles fit across a phone without breaking a word', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    await tester.binding.setSurfaceSize(const Size(360, 760));
    await tester.pumpAndSettle();

    for (final String role in <String>['Caregiver', 'Family', 'Volunteer']) {
      final RenderParagraph text = tester.renderObject<RenderParagraph>(find.text(role));
      expect(text.didExceedMaxLines, isFalse, reason: role);
      expect(tester.getSize(find.text(role)).height, lessThan(40), reason: '$role is one line');
    }
  });
}
