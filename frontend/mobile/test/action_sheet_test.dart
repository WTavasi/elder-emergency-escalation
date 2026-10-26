import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/core/widgets/action_sheet.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// Pop-ups as sheets from the bottom, and controls without the emergency red.
void main() {
  /// A button that opens a sign-out question and records the answer.
  Future<List<bool?>> show(
    WidgetTester tester, {
    TargetPlatform platform = TargetPlatform.iOS,
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
                await showActionSheet<bool>(
                  context,
                  title: 'Sign out of this phone?',
                  message: 'While you are signed out, this phone cannot ask for help.',
                  actions: const <SheetAction<bool>>[
                    SheetAction<bool>('Sign out', true, icon: Icons.logout, destructive: true),
                    SheetAction<bool>('Stay signed in', false, icon: Icons.close),
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

  group('an action sheet', () {
    for (final TargetPlatform platform in <TargetPlatform>[
      TargetPlatform.iOS,
      TargetPlatform.android,
    ]) {
      testWidgets('slides up from the bottom and answers with the pressed row ($platform)', (
        WidgetTester tester,
      ) async {
        final List<bool?> answers = await show(tester, platform: platform);

        expect(find.byType(BottomSheet), findsOneWidget);
        expect(find.byType(AlertDialog), findsNothing);

        await tester.tap(find.text('Sign out'));
        await tester.pumpAndSettle();
        expect(answers, <bool?>[true]);
      });
    }

    testWidgets('marks the destructive row in red, with an icon, and keeps the way out last', (
      WidgetTester tester,
    ) async {
      await show(tester);
      final ThemeData theme = MzaziTheme.light(AppAudience.standard);

      final RenderParagraph signOut = tester.renderObject<RenderParagraph>(find.text('Sign out'));
      expect(signOut.text.style?.color, theme.colorScheme.error);
      expect(find.byIcon(Icons.logout), findsOneWidget);
      expect(
        tester.getCenter(find.text('Stay signed in')).dy,
        greaterThan(tester.getCenter(find.text('Sign out')).dy),
      );
    });

    testWidgets('answers nothing when swiped away', (WidgetTester tester) async {
      final List<bool?> answers = await show(tester);

      await tester.fling(find.text('Sign out of this phone?'), const Offset(0, 600), 2000);
      await tester.pumpAndSettle();

      expect(find.byType(BottomSheet), findsNothing);
      expect(answers, <bool?>[null]);
    });

    testWidgets('ticks the choice already in place', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: Builder(
            builder: (BuildContext context) => Scaffold(
              body: TextButton(
                onPressed: () => showActionSheet<int>(
                  context,
                  title: 'How much help do they need?',
                  actions: const <SheetAction<int>>[
                    SheetAction<int>('Independent', 1),
                    SheetAction<int>('Assisted', 2, selected: true),
                  ],
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.check), findsOneWidget);
      expect(
        tester.getCenter(find.byIcon(Icons.check)).dy,
        closeTo(tester.getCenter(find.text('Assisted')).dy, 2),
      );
    });

    testWidgets("keeps Elder mode's sizes", (WidgetTester tester) async {
      await show(tester, audience: AppAudience.elder);

      final RenderParagraph body = tester.renderObject<RenderParagraph>(
        find.text('While you are signed out, this phone cannot ask for help.'),
      );
      expect(body.text.style?.fontSize, greaterThanOrEqualTo(MzaziA11y.elderMinBodySize));
      expect(
        tester
            .getSize(find.ancestor(of: find.text('Sign out'), matching: find.byType(InkWell)))
            .height,
        greaterThanOrEqualTo(MzaziA11y.elderMinTouchTarget),
      );
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
