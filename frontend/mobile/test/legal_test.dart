import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/legal/legal_screens.dart';
import 'package:provider/provider.dart';

import 'support.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  Map<String, dynamic> facts({Map<String, dynamic>? contact}) => <String, dynamic>{
    'privacyVersion': '2026-10-1',
    'termsVersion': '2026-10-1',
    'retention': <String, dynamic>{'enabled': true, 'closedEmergencyDays': 365, 'auditLogDays': 180},
    'contact': contact,
  };

  /// [screen] signed out, against a server that answers [answer], or cannot be reached.
  Future<List<Exchange>> pump(WidgetTester tester, Widget screen, {http.Response? answer}) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[answer ?? http.Response('', 503)],
    );
    final AuthController auth = AuthController(api: t.api, store: SessionStore());

    await tester.binding.setSurfaceSize(const Size(800, 4000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: auth,
        child: MaterialApp(theme: MzaziTheme.light(AppAudience.standard), home: screen),
      ),
    );
    await tester.pumpAndSettle();
    return t.calls;
  }

  testWidgets('the notice reads signed out, with the server\'s own figures and contact', (
    WidgetTester tester,
  ) async {
    final List<Exchange> calls = await pump(
      tester,
      const PrivacyNoticeScreen(),
      answer: json(
        facts(
          contact: <String, dynamic>{
            'name': 'MzaziCare data contact',
            'email': 'data@example.org',
            'address': null,
          },
        ),
      ),
    );

    expect(calls.single.path, '/api/v1/legal');
    expect(calls.single.authorization, isNull);
    expect(find.textContaining('deleted 365 days after they close'), findsOneWidget);
    expect(find.textContaining('after 180 days'), findsOneWidget);
    expect(find.text('MzaziCare data contact\ndata@example.org'), findsOneWidget);
    expect(find.text('Version 2026-10-1'), findsOneWidget);
  });

  testWidgets('says that an open emergency is answered whatever was withdrawn', (
    WidgetTester tester,
  ) async {
    await pump(tester, const PrivacyNoticeScreen(), answer: json(facts()));
    expect(find.text(vitalInterestsSentence), findsOneWidget);
    expect(vitalInterestsSentence, contains('vital interests'));
  });

  testWidgets('never invents a contact', (WidgetTester tester) async {
    await pump(tester, const PrivacyNoticeScreen(), answer: json(facts()));
    expect(find.textContaining('No contact has been set for this server yet'), findsOneWidget);
  });

  testWidgets('still reads in full without the server', (WidgetTester tester) async {
    await pump(tester, const PrivacyNoticeScreen());
    expect(find.textContaining('after the period set on the server'), findsOneWidget);
    expect(find.textContaining('could not be loaded'), findsOneWidget);
    expect(find.text(vitalInterestsSentence), findsOneWidget);
  });

  testWidgets('the terms say it does not replace 999 or 112', (WidgetTester tester) async {
    await pump(tester, const TermsScreen(), answer: json(facts()));
    // Section labels are set in capitals.
    expect(find.text('NOT A REPLACEMENT FOR 999 OR 112'), findsOneWidget);
    expect(find.textContaining('call 999 or 112'), findsOneWidget);
  });
}
