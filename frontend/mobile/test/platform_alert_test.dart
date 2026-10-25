import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/core/widgets/platform_alert.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// Alerts and controls in the platform's own shape, without the emergency red.
void main() {
  /// A button that opens a sign-out question and records the answer.
  Future<List<bool?>> show(
    WidgetTester tester, {
    required TargetPlatform platform,
    AppAudience audience = AppAudience.standard,
  }) async {
    final List<bool?> answers = <bool?>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: MzaziTheme.light(audience).copyWith(platform: platform),
        home: Builder(
          builder: (BuildContext context) => Scaffold(
            body: TextButton(
              onPressed: () async => answers.add(
                await showPlatformAlert<bool>(
                  context,
                  title: 'Sign out of this phone?',
                  content: const Text('While you are signed out, this phone cannot ask for help.'),
                  actions: const <AlertAction<bool>>[
                    AlertAction<bool>('Stay signed in', false),
                    AlertAction<bool>('Sign out', true, destructive: true),
                  ],
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    return answers;
  }

  group('a platform alert', () {
    testWidgets('is Material on Android, and answers with the pressed value', (
      WidgetTester tester,
    ) async {
      final List<bool?> answers = await show(tester, platform: TargetPlatform.android);

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.byType(CupertinoAlertDialog), findsNothing);

      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(answers, <bool?>[true]);
    });

    testWidgets("is iOS's own on iPhone, with the destructive answer marked as such", (
      WidgetTester tester,
    ) async {
      final List<bool?> answers = await show(tester, platform: TargetPlatform.iOS);

      expect(find.byType(CupertinoAlertDialog), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      final CupertinoDialogAction signOut = tester.widget<CupertinoDialogAction>(
        find.ancestor(of: find.text('Sign out'), matching: find.byType(CupertinoDialogAction)),
      );
      expect(signOut.isDestructiveAction, isTrue);

      await tester.tap(find.text('Stay signed in'));
      await tester.pumpAndSettle();
      expect(answers, <bool?>[false]);
    });

    testWidgets("keeps the elder's type and sizes on iPhone, above iOS's 17 points", (
      WidgetTester tester,
    ) async {
      await show(tester, platform: TargetPlatform.iOS, audience: AppAudience.elder);

      final RenderParagraph body = tester.renderObject<RenderParagraph>(
        find.text('While you are signed out, this phone cannot ask for help.'),
      );
      expect(body.text.style?.fontFamily, MzaziFont.elder);
      expect(body.text.style?.fontSize, greaterThanOrEqualTo(MzaziA11y.elderMinBodySize));
    });
  });

  group('controls', () {
    test('take the focus blue as the iOS tint, never the emergency red', () {
      final ThemeData theme = MzaziTheme.light(AppAudience.standard);
      expect(theme.cupertinoOverrideTheme?.primaryColor, MzaziColorsLight.focus);
    });

    test('are ink when on or chosen, not the emergency red', () {
      for (final ThemeData theme in <ThemeData>[
        MzaziTheme.light(AppAudience.standard),
        MzaziTheme.dark(AppAudience.elder),
      ]) {
        const Set<WidgetState> on = <WidgetState>{WidgetState.selected};
        final Color ink = theme.colorScheme.onSurface;
        final Color red = theme.colorScheme.primary;

        expect(theme.switchTheme.trackColor?.resolve(on), ink);
        expect(theme.checkboxTheme.fillColor?.resolve(on), ink);
        expect(theme.radioTheme.fillColor?.resolve(on), ink);
        expect(theme.sliderTheme.activeTrackColor, ink);
        expect(theme.progressIndicatorTheme.color, ink);
        for (final Color? colour in <Color?>[
          theme.switchTheme.trackColor?.resolve(on),
          theme.checkboxTheme.fillColor?.resolve(on),
          theme.radioTheme.fillColor?.resolve(on),
          theme.sliderTheme.activeTrackColor,
          theme.progressIndicatorTheme.color,
        ]) {
          expect(colour, isNot(red));
        }
      }
    });
  });
}
