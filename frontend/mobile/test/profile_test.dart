import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/profile/profile_screen.dart';
import 'package:provider/provider.dart';

import 'support.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  /// The profile screen for a signed-in caregiver. [answer] replies to every request
  /// after the sign-in, and each request's method, path and body are recorded.
  Future<List<({String method, String path, Map<String, dynamic>? body})>> pump(
    WidgetTester tester,
    http.Response Function(http.Request request) answer,
  ) async {
    final List<({String method, String path, Map<String, dynamic>? body})> seen =
        <({String method, String path, Map<String, dynamic>? body})>[];
    final Map<String, dynamic> caregiver = sessionBody();
    (caregiver['user'] as Map<String, dynamic>)
      ..['id'] = 'carer-1'
      ..['name'] = 'Mary Otieno'
      ..['phone'] = '+254700000020'
      ..['role'] = 'CAREGIVER'
      ..remove('home');

    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int index) {
      if (index == 0) return <http.Response>[json(caregiver)];
      seen.add((
        method: request.method,
        path: request.url.path,
        body: request.body.isEmpty ? null : jsonDecode(request.body) as Map<String, dynamic>,
      ));
      return <http.Response>[answer(request)];
    });
    final AuthController auth = AuthController(api: t.api, store: SessionStore());
    await auth.signIn(phone: '+254700000020', password: 'Dev!2026');

    await tester.binding.setSurfaceSize(const Size(800, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: auth,
        child: MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: const ProfileScreen(),
        ),
      ),
    );
    return seen;
  }

  testWidgets('shows the account, with the phone number not editable', (WidgetTester tester) async {
    await pump(tester, (_) => json(<String, dynamic>{}));

    expect(find.text('My account'), findsOneWidget);
    expect(find.text('Caregiver'), findsOneWidget);
    expect(find.text('+254700000020'), findsOneWidget);
    // Nothing to save until something changes.
    final FilledButton save = tester.widget<FilledButton>(
      find.ancestor(of: find.text('Save changes'), matching: find.byType(FilledButton)),
    );
    expect(save.onPressed, isNull);
  });

  testWidgets('saves a new email address', (WidgetTester tester) async {
    final List<({String method, String path, Map<String, dynamic>? body})> seen = await pump(
      tester,
      (_) => json(<String, dynamic>{
        'id': 'carer-1',
        'name': 'Mary Otieno',
        'phone': '+254700000020',
        'email': 'mary@example.com',
        'role': 'CAREGIVER',
        'home': null,
      }),
    );

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Email (optional)'),
      'mary@example.com',
    );
    await tester.pump();
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();

    expect(seen.single.method, 'PATCH');
    expect(seen.single.path, '/api/v1/auth/me');
    expect(seen.single.body, <String, dynamic>{'email': 'mary@example.com'});
    expect(find.text('Saved.'), findsOneWidget);
  });

  testWidgets('shows the server\'s answer when the current password is wrong', (
    WidgetTester tester,
  ) async {
    await pump(
      tester,
      (_) => json(<String, dynamic>{'message': 'Your current password is not right'}, 400),
    );

    await tester.enterText(find.widgetWithText(TextFormField, 'Current password'), 'nope');
    await tester.enterText(find.widgetWithText(TextFormField, 'New password'), 'Another!2026');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'New password again'),
      'Another!2026',
    );
    await tester.tap(find.text('Change password').last);
    await tester.pumpAndSettle();

    expect(find.text('Your current password is not right'), findsOneWidget);
  });

  testWidgets('changes the password and says other phones will be signed out', (
    WidgetTester tester,
  ) async {
    final List<({String method, String path, Map<String, dynamic>? body})> seen = await pump(
      tester,
      (_) => json(sessionBody(access: 'access-2', refresh: 'refresh-2')),
    );

    await tester.enterText(find.widgetWithText(TextFormField, 'Current password'), 'Dev!2026');
    await tester.enterText(find.widgetWithText(TextFormField, 'New password'), 'Another!2026');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'New password again'),
      'Another!2026',
    );
    await tester.tap(find.text('Change password').last);
    await tester.pumpAndSettle();

    expect(seen.single.path, '/api/v1/auth/change-password');
    expect(seen.single.body, <String, dynamic>{
      'currentPassword': 'Dev!2026',
      'newPassword': 'Another!2026',
    });
    expect(find.textContaining('will be signed out'), findsOneWidget);
  });
}
