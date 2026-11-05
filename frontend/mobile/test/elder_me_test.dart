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
        if (index == 0)
          json(sessionBody())
        else if (request.url.path.endsWith('/auth/me/profile'))
          json(<String, dynamic>{
            'memberSince': '2026-09-01T08:00:00.000Z',
            'circles': <Object>[],
            'record': null,
            'carers': <Object>[
              <String, dynamic>{
                'name': 'Mary Otieno',
                'role': 'CAREGIVER',
                'place': 1,
                'phone': '+254700000020',
              },
            ],
          })
        else if (request.url.path.endsWith('/services'))
          json(<String, dynamic>{
            'hasHome': true,
            'services': <Map<String, dynamic>>[
              <String, dynamic>{
                'name': 'Kileleshwa Response Unit',
                'service': 'GENERAL',
                'station': null,
                'etaSeconds': 300,
                'byRoad': false,
              },
              <String, dynamic>{
                'name': 'Kileleshwa Police Station',
                'service': 'POLICE',
                'station': 'Off Laikipia Road',
                'etaSeconds': 240,
                'byRoad': true,
              },
            ],
          })
        else
          http.Response('', 204),
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

  testWidgets('shows who comes when they press for help, each a call away', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    await tester.pumpAndSettle();

    // Out in the open, first on the page, one press from a call. Labels are capitals.
    expect(find.text('CALL YOUR PEOPLE'), findsOneWidget);
    expect(find.text('Call Mary'), findsOneWidget);
    expect(find.text('Mary Otieno, caregiver, asked first'), findsOneWidget);
    expect(
      tester.getCenter(find.text('Call Mary')).dy,
      lessThan(tester.getCenter(find.text('HELP NEARBY')).dy),
    );
    expect(find.text('Privacy notice'), findsOneWidget);
  });

  testWidgets('shows who else can come, folded away until opened', (WidgetTester tester) async {
    await pump(tester);
    await tester.pumpAndSettle();

    expect(find.text('Emergency services near you'), findsOneWidget);
    expect(find.text('Emergency responder, Police'), findsOneWidget);

    await tester.tap(find.text('Emergency services near you'));
    await tester.pumpAndSettle();
    expect(find.text('Kileleshwa Response Unit'), findsOneWidget);
    expect(
      find.text("Asked if your family can't come. About 5 minutes away"),
      findsOneWidget,
    );
    expect(
      find.text("Asked if you're not safe. About 4 minutes away by road"),
      findsOneWidget,
    );
  });

  testWidgets('asks before signing out, and staying changes nothing', (WidgetTester tester) async {
    final ({AuthController auth, List<Exchange> calls}) t = await pump(tester);

    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(find.text('Sign out?'), findsOneWidget);
    await tester.tap(find.text('Stay signed in'));
    await tester.pumpAndSettle();

    expect(t.auth.isSignedIn, isTrue);
    expect(t.calls.where((Exchange c) => c.path.endsWith('/auth/logout')), isEmpty);
  });

  testWidgets('signs out once the elder says so', (WidgetTester tester) async {
    final ({AuthController auth, List<Exchange> calls}) t = await pump(tester);

    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    // The sheet's own Sign out, over the page's.
    await tester.tap(find.text('Sign out').last);
    await tester.pumpAndSettle();

    expect(t.auth.isSignedIn, isFalse);
    expect(t.calls.where((Exchange c) => c.path.endsWith('/auth/logout')), hasLength(1));
  });

  testWidgets('has privacy and terms in a part of their own, as everybody else does', (
    WidgetTester tester,
  ) async {
    await pump(tester);

    expect(find.text('PRIVACY'), findsOneWidget);
    expect(find.text('Privacy and consent'), findsOneWidget);
    expect(find.text('Privacy notice'), findsOneWidget);
    expect(find.text('Terms of use'), findsOneWidget);
    // The privacy part comes before signing out, which is last.
    expect(
      tester.getCenter(find.text('PRIVACY')).dy,
      lessThan(tester.getCenter(find.text('Sign out')).dy),
    );
  });
}
