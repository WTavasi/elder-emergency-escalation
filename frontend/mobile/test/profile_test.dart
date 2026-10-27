import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/location/position_source.dart';
import 'package:mzazicare/core/location/way_there.dart';
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
    http.Response Function(http.Request request) answer, {
    WayThere? way,
    Map<String, dynamic>? profile,
  }) async {
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
      // The care profile loads with the page. Answered here and left out of what the
      // tests see, which is what the person did.
      if (request.url.path.endsWith('/auth/me/profile')) {
        return <http.Response>[
          json(
            profile ??
                <String, dynamic>{
                  'memberSince': '2026-09-01T08:00:00.000Z',
                  'circles': <Object>[],
                  'record': <String, dynamic>{'answered': 0},
                  'carers': <Object>[],
                },
          ),
        ];
      }
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
    final Widget app = ChangeNotifierProvider<AuthController>.value(
      value: auth,
      child: MaterialApp(
        theme: MzaziTheme.light(AppAudience.standard),
        home: const ProfileScreen(),
      ),
    );
    await tester.pumpWidget(
      way == null ? app : ChangeNotifierProvider<WayThere>.value(value: way, child: app),
    );
    return seen;
  }

  testWidgets('shows the account, with the phone number changed elsewhere', (
    WidgetTester tester,
  ) async {
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

  testWidgets('the phone number is as tall as the name and email, and opens as one button', (
    WidgetTester tester,
  ) async {
    await pump(tester, (_) => json(<String, dynamic>{}));
    await tester.pumpAndSettle();

    // How far into its field a line of text sits. The same for the value in two fields
    // means the same box around it; the same for two helper lines means the same box
    // above them.
    double into(Finder text) =>
        tester.getTopLeft(text).dy -
        tester.getTopLeft(find.ancestor(of: text, matching: find.byType(InputDecorator)).first).dy;
    expect(into(find.text('+254700000020')), into(find.text('Mary Otieno').last));
    expect(
      into(find.text('You sign in with this number. Changing it needs a code.')),
      into(find.text('At least 8 characters')),
    );

    // Anywhere on the field, not only the word, opens the change.
    await tester.tap(find.text('+254700000020'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'New phone number'), findsOneWidget);
  });

  testWidgets('says where they stand in each circle and what they have done', (
    WidgetTester tester,
  ) async {
    await pump(
      tester,
      (_) => json(<String, dynamic>{}),
      profile: <String, dynamic>{
        'memberSince': '2026-09-01T08:00:00.000Z',
        'circles': <Object>[
          <String, dynamic>{'elderId': 'elder-1', 'elderName': 'Grace Wanjiru', 'place': 1},
        ],
        'record': <String, dynamic>{
          'answered': 3,
          'medianResponseSeconds': 125,
          'lastAnsweredAt': '2026-10-09T10:02:00.000Z',
        },
        'carers': <Object>[],
      },
    );
    await tester.pumpAndSettle();

    expect(find.text('Asked first for Grace Wanjiru'), findsOneWidget);
    expect(find.text('You have answered 3 emergencies.'), findsOneWidget);
    expect(find.text('You usually answer in about 2 minutes.'), findsOneWidget);
    expect(find.text('Last answered on 9 October 2026.'), findsOneWidget);
  });

  testWidgets('moves the account to a new number with the password and a code', (
    WidgetTester tester,
  ) async {
    final Map<String, dynamic> moved = sessionBody();
    (moved['user'] as Map<String, dynamic>)
      ..['id'] = 'carer-1'
      ..['name'] = 'Mary Otieno'
      ..['phone'] = '+254711000111'
      ..['role'] = 'CAREGIVER'
      ..remove('home');
    final List<({String method, String path, Map<String, dynamic>? body})> seen = await pump(
      tester,
      (http.Request request) => request.url.path.endsWith('/auth/me/phone')
          ? json(moved)
          : http.Response('', 202),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Change'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'New phone number'), '0711000111');
    await tester.enterText(find.widgetWithText(TextFormField, 'Current password'), 'Dev!2026');
    await tester.tap(find.text('Text a code to the new number'));
    // Not pumpAndSettle while the resend countdown ticks.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(seen.first.path, '/api/v1/auth/me/phone/code');
    expect(seen.first.body, <String, dynamic>{'phone': '+254711000111', 'password': 'Dev!2026'});

    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), '123456');
    await tester.tap(find.text('Change my number'));
    await tester.pump();
    // The page closes, which stops its countdown, and then the profile can settle.
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(seen.last.path, '/api/v1/auth/me/phone');
    expect(seen.last.body, <String, dynamic>{'phone': '+254711000111', 'code': '123456'});
    expect(find.text('+254711000111'), findsOneWidget);
    expect(find.textContaining('Number changed'), findsOneWidget);
  });

  testWidgets('links the privacy notice and the terms', (WidgetTester tester) async {
    await pump(tester, (_) => json(<String, dynamic>{}));
    await tester.pumpAndSettle();

    expect(find.text('Privacy notice'), findsOneWidget);
    expect(find.text('Terms of use'), findsOneWidget);
  });

  testWidgets('asks before signing out, as the elder is asked, and staying changes nothing', (
    WidgetTester tester,
  ) async {
    final List<({String method, String path, Map<String, dynamic>? body})> seen = await pump(
      tester,
      (_) => json(<String, dynamic>{}),
    );
    await tester.pumpAndSettle();
    final AuthController auth = tester.element(find.byType(ProfileScreen)).read<AuthController>();

    await tester.tap(find.text('Sign out of this phone'));
    await tester.pumpAndSettle();

    expect(find.text('Sign out of this phone?'), findsOneWidget);
    // Said for a caregiver: what they will miss, and how they will still be reached.
    expect(find.textContaining('you will be sent a text instead'), findsOneWidget);
    await tester.tap(find.text('Stay signed in'));
    await tester.pumpAndSettle();

    expect(auth.isSignedIn, isTrue);
    expect(
      seen.where((({String method, String path, Map<String, dynamic>? body}) r) {
        return r.path.endsWith('/auth/logout');
      }),
      isEmpty,
    );
  });

  testWidgets('signs out once the person says so', (WidgetTester tester) async {
    final List<({String method, String path, Map<String, dynamic>? body})> seen = await pump(
      tester,
      (_) => json(<String, dynamic>{}),
    );
    await tester.pumpAndSettle();
    final AuthController auth = tester.element(find.byType(ProfileScreen)).read<AuthController>();

    await tester.tap(find.text('Sign out of this phone'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(auth.isSignedIn, isFalse);
    expect(
      seen.where((({String method, String path, Map<String, dynamic>? body}) r) {
        return r.path.endsWith('/auth/logout');
      }),
      hasLength(1),
    );
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
    await tester.tap(find.text('Change password').last);
    await tester.pumpAndSettle();

    expect(seen.single.path, '/api/v1/auth/change-password');
    expect(seen.single.body, <String, dynamic>{
      'currentPassword': 'Dev!2026',
      'newPassword': 'Another!2026',
    });
    expect(find.textContaining('will be signed out'), findsOneWidget);
  });

  group('share my way there', () {
    late FakePositionSource source;

    setUp(() => source = FakePositionSource());
    tearDown(() => source.close());

    /// Sharing for the signed-in caregiver, against a server that starts with it off.
    Future<({WayThere way, List<String> patches})> sharing() async {
      final List<String> patches = <String>[];
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.method == 'PATCH') {
          patches.add(request.body);
          return <http.Response>[json(jsonDecode(request.body) as Map<String, dynamic>)];
        }
        return <http.Response>[
          json(<String, dynamic>{'shareWayThere': false}),
        ];
      });
      final WayThere way = WayThere(api: t.api, source: source);
      await way.follow('carer-1');
      return (way: way, patches: patches);
    }

    testWidgets('is off until turned on, and asks for location when it is', (
      WidgetTester tester,
    ) async {
      final ({WayThere way, List<String> patches}) t = await sharing();
      await pump(tester, (_) => json(<String, dynamic>{}), way: t.way);

      final Finder toggle = find.widgetWithText(SwitchListTile, 'Share my way there');
      expect(tester.widget<SwitchListTile>(toggle).value, isFalse);

      await tester.tap(toggle);
      await tester.pumpAndSettle();

      // Checked, then asked: already allowed, so nothing to explain first.
      expect(source.asked, <bool>[false, true]);
      expect(t.patches.single, contains('"shareWayThere":true'));
      expect(tester.widget<SwitchListTile>(toggle).value, isTrue);
      t.way.dispose();
    });

    testWidgets('says why before the phone asks, on a phone never asked before', (
      WidgetTester tester,
    ) async {
      source
        ..answer = LocationAccess.denied
        ..afterAsking = LocationAccess.granted;
      final ({WayThere way, List<String> patches}) t = await sharing();
      await pump(tester, (_) => json(<String, dynamic>{}), way: t.way);

      await tester.tap(find.widgetWithText(SwitchListTile, 'Share my way there'));
      await tester.pumpAndSettle();

      // Apple's pattern: one way on, called Continue, and the phone asks only after it.
      expect(find.byType(BottomSheet), findsOneWidget);
      expect(source.asked, <bool>[false]);
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(source.asked, <bool>[false, true]);
      expect(t.patches.single, contains('"shareWayThere":true'));
      t.way.dispose();
    });

    testWidgets('stays off and says how to fix it when location is refused for good', (
      WidgetTester tester,
    ) async {
      source.answer = LocationAccess.deniedForever;
      final ({WayThere way, List<String> patches}) t = await sharing();
      await pump(tester, (_) => json(<String, dynamic>{}), way: t.way);

      await tester.tap(find.widgetWithText(SwitchListTile, 'Share my way there'));
      await tester.pumpAndSettle();

      expect(t.patches, isEmpty);
      expect(find.textContaining('phone settings'), findsOneWidget);
      expect(find.text('Open settings'), findsOneWidget);
      t.way.dispose();
    });
  });
}
