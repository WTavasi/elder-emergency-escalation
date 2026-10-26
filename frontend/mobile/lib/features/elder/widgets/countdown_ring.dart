import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/theme/theme.dart';
import '../../../core/widgets/motion.dart';
import 'panic_button.dart';

/// The seconds left to stop an alert, as a number inside a ring that empties.
///
/// Two ways of reading the same thing, after the countdown phones show before an SOS
/// call: the number for somebody who reads it, and the ring for somebody who only
/// glances, since how much is left is clear from the shape alone. The ring moves smoothly
/// between seconds, or steps once a second with Reduce Motion on.
///
/// Drawn on the caution yellow, in the one ink that reads on it.
class CountdownRing extends StatelessWidget {
  const CountdownRing({required this.secondsLeft, required this.total, super.key});

  final int secondsLeft;
  final int total;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double fraction = total <= 0 ? 0 : (secondsLeft / total).clamp(0.0, 1.0);

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        // The help button's size, from the help button's rule, so the ring sits exactly
        // where the button was.
        final double side = PanicButton.diameterFor(constraints.biggest);

        return Center(
          child: SizedBox.square(
            dimension: side,
            child: TweenAnimationBuilder<double>(
              // Starts full and runs down to where the count is, a second at a time.
              tween: Tween<double>(end: fraction),
              duration: Motion.of(context, const Duration(seconds: 1)),
              curve: Curves.linear,
              builder: (BuildContext context, double value, Widget? child) => CustomPaint(
                painter: _RingPainter(
                  fraction: value,
                  ink: MzaziColorsLight.onCaution,
                  track: MzaziColorsLight.cautionTrack,
                ),
                child: child,
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    // The number is the thing being read under pressure, so it is set at
                    // display size in the monospaced face, where a changing digit does
                    // not move the ones beside it.
                    Text(
                      '$secondsLeft',
                      style: theme.textTheme.displayLarge?.figures,
                      semanticsLabel: '$secondsLeft seconds left to stop this',
                    ),
                    ExcludeSemantics(
                      child: Text(
                        secondsLeft == 1 ? 'second' : 'seconds',
                        style: theme.textTheme.bodyLarge,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.fraction, required this.ink, required this.track});

  final double fraction;
  final Color ink;
  final Color track;

  /// Thick enough to read at a glance, from arm's length.
  static const double _stroke = MzaziSpace.s12;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect bounds = (Offset.zero & size).deflate(_stroke / 2);
    final Paint base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = _stroke
      ..color = track;
    canvas.drawArc(bounds, 0, 2 * math.pi, false, base);

    if (fraction <= 0) return;
    final Paint left = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = _stroke
      ..strokeCap = StrokeCap.round
      ..color = ink;
    // From twelve o'clock, clockwise, the way a clock face empties.
    canvas.drawArc(bounds, -math.pi / 2, 2 * math.pi * fraction, false, left);
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.fraction != fraction || old.ink != ink || old.track != track;
}
