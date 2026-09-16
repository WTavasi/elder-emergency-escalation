import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/theme/theme.dart';
import 'package:mzazicare/widgets/panic_button.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The accessibility floors, asserted rather than documented.
///
/// The generated token file says these are "asserted in widget tests, not just
/// documented". This is that promise being kept. Every assertion compares against the
/// token constant rather than a number typed here, so lowering a floor in tokens.json
/// cannot quietly pass a test that was written to a copy of the old value.
void main() {
  Widget host(Widget child, {AppAudience audience = AppAudience.elder}) => MaterialApp(
        theme: MzaziTheme.light(audience),
        home: Scaffold(body: child),
      );

  group('the panic control', () {
    testWidgets('is never smaller than the elder touch target, even in a cramped space',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        host(
          // Deliberately far smaller than the floor. The control must refuse to shrink
          // past it rather than fitting whatever it is given.
          const SizedBox(
            width: 20,
            height: 20,
            child: PanicButton(onPressed: _noop, label: 'Get help'),
          ),
        ),
      );

      final Size size = tester.getSize(find.byType(InkWell));
      expect(size.width, greaterThanOrEqualTo(MzaziA11y.elderMinTouchTarget));
      expect(size.height, greaterThanOrEqualTo(MzaziA11y.elderMinTouchTarget));
    });

    testWidgets('grows into the space it is given', (WidgetTester tester) async {
      await tester.pumpWidget(
        host(
          const SizedBox(
            width: 320,
            height: 320,
            child: PanicButton(onPressed: _noop, label: 'Get help'),
          ),
        ),
      );

      expect(tester.getSize(find.byType(InkWell)).width, 320);
    });

    testWidgets('carries a label a screen reader can announce', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await tester.pumpWidget(
        host(const PanicButton(onPressed: _noop, label: 'Get help')),
      );

      expect(
        find.bySemanticsLabel(RegExp('Get help now')),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets('does not respond when disabled, so one press cannot become two',
        (WidgetTester tester) async {
      int presses = 0;
      await tester.pumpWidget(
        host(
          PanicButton(
            onPressed: () => presses += 1,
            label: 'Get help',
            enabled: false,
          ),
        ),
      );

      await tester.tap(find.byType(InkWell));
      expect(presses, 0);
    });
  });

  group('the elder type scale', () {
    test('never sets body text below the elder floor', () {
      final ThemeData theme = MzaziTheme.light(AppAudience.elder);

      for (final TextStyle? style in <TextStyle?>[
        theme.textTheme.bodyLarge,
        theme.textTheme.bodyMedium,
        // Secondary text included on purpose. On an elder's screen there is no such
        // thing as text that does not have to be read.
        theme.textTheme.bodySmall,
        theme.textTheme.labelLarge,
      ]) {
        expect(style?.fontSize, greaterThanOrEqualTo(MzaziA11y.elderMinBodySize));
      }
    });

    test('never sets body text below the standard floor for other roles', () {
      final ThemeData theme = MzaziTheme.light(AppAudience.standard);

      for (final TextStyle? style in <TextStyle?>[
        theme.textTheme.bodyLarge,
        theme.textTheme.bodySmall,
      ]) {
        expect(style?.fontSize, greaterThanOrEqualTo(MzaziA11y.standardMinBodySize));
      }
    });

    test('gives an elder larger text than a caregiver, which is the point of the split', () {
      expect(
        MzaziTheme.light(AppAudience.elder).textTheme.bodyLarge!.fontSize,
        greaterThan(MzaziTheme.light(AppAudience.standard).textTheme.bodyLarge!.fontSize!),
      );
    });
  });

  group('buttons', () {
    test('are at least one touch target tall for the audience', () {
      for (final AppAudience audience in AppAudience.values) {
        final ThemeData theme = MzaziTheme.light(audience);
        final Size? filled = theme.filledButtonTheme.style?.minimumSize?.resolve(
          <WidgetState>{},
        );
        final Size? outlined = theme.outlinedButtonTheme.style?.minimumSize?.resolve(
          <WidgetState>{},
        );

        expect(filled?.height, greaterThanOrEqualTo(MzaziTheme.touchTarget(audience)));
        expect(outlined?.height, greaterThanOrEqualTo(MzaziTheme.touchTarget(audience)));
      }
    });
  });

  group('dark mode', () {
    test('uses the dark tokens rather than dimming the light ones', () {
      // The contrast gate checks the dark palette as its own set of pairs. A theme
      // that derived dark from light would be unchecked by it.
      expect(MzaziTheme.dark(AppAudience.elder).scaffoldBackgroundColor, MzaziColorsDark.bg);
      expect(MzaziTheme.light(AppAudience.elder).scaffoldBackgroundColor, MzaziColorsLight.bg);
    });
  });
}

void _noop() {}
