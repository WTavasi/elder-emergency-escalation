import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/app.dart';
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/appearance.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:provider/provider.dart';

import 'support.dart';

/// Light or dark: the phone's setting unless the person chose otherwise.
void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  group('the appearance setting', () {
    test("follows the phone until somebody chooses", () async {
      final AppearanceController appearance = AppearanceController();
      await appearance.load();
      expect(appearance.mode, ThemeMode.system);
    });

    test('is kept on the phone, so it is the same next time the app opens', () async {
      await AppearanceController().choose(ThemeMode.dark);

      final AppearanceController next = AppearanceController();
      await next.load();

      expect(next.mode, ThemeMode.dark);
    });

    testWidgets('is chosen from three rows, with a tick on the one in use', (
      WidgetTester tester,
    ) async {
      final AppearanceController appearance = AppearanceController();
      await tester.pumpWidget(
        MaterialApp(
          theme: MzaziTheme.light(AppAudience.elder),
          home: Scaffold(body: AppearancePicker(controller: appearance)),
        ),
      );

      expect(find.text('Same as this phone'), findsOneWidget);
      expect(find.byIcon(Icons.check), findsOneWidget);

      await tester.tap(find.text('Light'));
      await tester.pump();

      expect(appearance.mode, ThemeMode.light);
      final ListTile light = tester.widget<ListTile>(
        find.ancestor(of: find.text('Light'), matching: find.byType(ListTile)),
      );
      expect(light.trailing, isNotNull);
    });

    testWidgets('every row is a full touch target at the elder size', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: MzaziTheme.light(AppAudience.elder),
          home: Scaffold(body: AppearancePicker(controller: AppearanceController())),
        ),
      );

      for (final String label in <String>['Same as this phone', 'Light', 'Dark']) {
        final Size row = tester.getSize(
          find.ancestor(of: find.text(label), matching: find.byType(ListTile)),
        );
        expect(row.height, greaterThanOrEqualTo(MzaziTheme.touchTarget(AppAudience.elder)));
      }
    });

    testWidgets('the app follows it', (WidgetTester tester) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int i) => <http.Response>[json(<String, dynamic>{})],
      );
      final AuthController auth = AuthController(api: t.api, store: SessionStore());
      final AppearanceController appearance = AppearanceController();

      await tester.pumpWidget(
        ChangeNotifierProvider<AppearanceController>.value(
          value: appearance,
          child: ChangeNotifierProvider<AuthController>.value(
            value: auth,
            child: MzaziCareApp(api: t.api),
          ),
        ),
      );
      ThemeMode mode() => tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode!;

      expect(mode(), ThemeMode.system);

      await appearance.choose(ThemeMode.dark);
      await tester.pump();

      expect(mode(), ThemeMode.dark);
    });
  });
}
