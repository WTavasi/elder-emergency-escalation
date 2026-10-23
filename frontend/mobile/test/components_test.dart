import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/core/widgets/bottom_action_bar.dart';
import 'package:mzazicare/core/widgets/progress_stepper.dart';
import 'package:mzazicare/core/widgets/skeleton.dart';
import 'package:mzazicare/core/widgets/swipe_to_confirm.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

Widget host(Widget child, {bool reduceMotion = false}) => MaterialApp(
  theme: MzaziTheme.light(AppAudience.standard),
  home: Builder(
    builder: (BuildContext context) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
      child: Scaffold(
        body: Padding(padding: const EdgeInsets.all(16), child: child),
      ),
    ),
  ),
);

const String swipeLabel = 'Swipe to close the alert';

void main() {
  group('progress stepper', () {
    testWidgets('reads as one sentence naming the current step', (WidgetTester tester) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        host(
          const ProgressStepper(steps: <String>['Told', 'Coming', 'Arrived', 'Closed'], current: 1),
        ),
      );

      expect(find.bySemanticsLabel('Step 2 of 4, Coming'), findsOneWidget);
      expect(find.text('Arrived'), findsOneWidget);
      semantics.dispose();
    });
  });

  group('swipe to confirm', () {
    testWidgets('confirms when dragged across', (WidgetTester tester) async {
      int confirmed = 0;
      await tester.pumpWidget(
        host(SwipeToConfirm(label: swipeLabel, onConfirmed: () => confirmed += 1)),
      );

      await tester.drag(find.byIcon(Icons.arrow_forward), const Offset(2000, 0));
      await tester.pumpAndSettle();
      expect(confirmed, 1);

      // The tick holds while the screen catches up, rather than springing back.
      await tester.pump(const Duration(seconds: 1));
      expect(find.byIcon(Icons.check), findsOneWidget);

      // It returns to the start in case the screen stays, so the action can be retried.
      await tester.pump(SwipeToConfirm.holdTick);
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(find.byIcon(Icons.arrow_forward)).dx, lessThan(100));
    });

    testWidgets('goes back at once when the request ends and the slider is still here', (
      WidgetTester tester,
    ) async {
      Widget slider({required bool enabled}) => host(
        SwipeToConfirm(label: swipeLabel, enabled: enabled, onConfirmed: () {}),
      );
      await tester.pumpWidget(slider(enabled: true));
      await tester.drag(find.byIcon(Icons.arrow_forward), const Offset(2000, 0));
      await tester.pump();

      // Busy: still ticked.
      await tester.pumpWidget(slider(enabled: false));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.check), findsOneWidget);

      // Free again and still on screen, so it failed: ready for another swipe.
      await tester.pumpWidget(slider(enabled: true));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.arrow_forward), findsOneWidget);
      expect(tester.getTopLeft(find.byIcon(Icons.arrow_forward)).dx, lessThan(100));
    });

    testWidgets('springs back without confirming on a short drag', (WidgetTester tester) async {
      int confirmed = 0;
      await tester.pumpWidget(
        host(SwipeToConfirm(label: swipeLabel, onConfirmed: () => confirmed += 1)),
      );

      await tester.drag(find.byIcon(Icons.arrow_forward), const Offset(60, 0));
      await tester.pumpAndSettle();

      expect(confirmed, 0);
    });

    testWidgets('is a plain button to a screen reader', (WidgetTester tester) async {
      int confirmed = 0;
      await tester.pumpWidget(
        host(SwipeToConfirm(label: swipeLabel, onConfirmed: () => confirmed += 1)),
      );

      final Semantics node = tester.widget<Semantics>(
        find.byWidgetPredicate((Widget w) => w is Semantics && w.properties.label == swipeLabel),
      );
      expect(node.properties.button, isTrue);
      node.properties.onTap!();
      await tester.pumpAndSettle();

      expect(confirmed, 1);
    });

    testWidgets('does nothing while disabled', (WidgetTester tester) async {
      int confirmed = 0;
      await tester.pumpWidget(
        host(SwipeToConfirm(label: swipeLabel, enabled: false, onConfirmed: () => confirmed += 1)),
      );

      await tester.drag(find.byIcon(Icons.arrow_forward), const Offset(2000, 0));
      await tester.pumpAndSettle();

      expect(confirmed, 0);
    });
  });

  group('bottom action bar', () {
    testWidgets('gives every action at least the touch target', (WidgetTester tester) async {
      await tester.pumpWidget(
        host(
          Align(
            alignment: Alignment.bottomCenter,
            child: BottomActionBar(
              elder: true,
              children: <Widget>[
                FilledButton(onPressed: () {}, child: const Text('Call Peter')),
                TextButton(onPressed: () {}, child: const Text('Not now')),
              ],
            ),
          ),
        ),
      );

      for (final String label in <String>['Call Peter', 'Not now']) {
        final Finder button = find.ancestor(
          of: find.text(label),
          matching: find.byWidgetPredicate((Widget w) => w is ButtonStyleButton),
        );
        expect(tester.getSize(button).height, greaterThanOrEqualTo(MzaziA11y.elderMinTouchTarget));
      }
    });
  });

  group('skeleton', () {
    testWidgets('holds still under Reduce Motion', (WidgetTester tester) async {
      await tester.pumpWidget(host(const Skeleton(width: 120), reduceMotion: true));

      // pumpAndSettle times out on an animation that repeats forever, so settling at
      // all proves the pulse stopped.
      await tester.pumpAndSettle();
      expect(find.byType(Skeleton), findsOneWidget);
    });
  });
}
