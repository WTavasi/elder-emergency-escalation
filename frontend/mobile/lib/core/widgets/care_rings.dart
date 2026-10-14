import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The background of the screens before sign-in: rings spreading from one corner, the
/// way a call for help goes out to the people around somebody.
///
/// Drawn rather than an image, so it costs nothing to ship, stays sharp at any size and
/// follows the theme. The colours are the decorative pair in the tokens, kept far
/// enough from the background that the rings are seen and close enough that no text
/// ever has to be read against them: everything legible sits on a card or on plain
/// background past the rings' reach.
///
/// It does not move. A sign-in screen is somewhere people arrive anxious, and an
/// animation behind a form is something to look at instead of the form.
class CareRings extends StatelessWidget {
  const CareRings({required this.child, this.origin = Alignment.topLeft, super.key});

  final Widget child;

  /// Where the rings spread from. Any corner; the top left by default.
  final Alignment origin;

  @override
  Widget build(BuildContext context) {
    final bool dark = Theme.of(context).brightness == Brightness.dark;

    return Stack(
      children: <Widget>[
        Positioned.fill(
          child: ExcludeSemantics(
            child: RepaintBoundary(
              child: CustomPaint(
                painter: CareRingsPainter(
                  origin: origin,
                  wash: dark ? MzaziColorsDark.decorWash : MzaziColorsLight.decorWash,
                  ring: dark ? MzaziColorsDark.decorRing : MzaziColorsLight.decorRing,
                  clear: dark ? MzaziColorsDark.bg : MzaziColorsLight.bg,
                ),
              ),
            ),
          ),
        ),
        child,
      ],
    );
  }
}

/// Concentric bands, alternately washed and clear, each edged with a fine ring, out to
/// a little over half the screen's longer side.
class CareRingsPainter extends CustomPainter {
  const CareRingsPainter({
    required this.origin,
    required this.wash,
    required this.ring,
    required this.clear,
  });

  final Alignment origin;
  final Color wash;
  final Color ring;

  /// The page background, for the bands between the washed ones.
  final Color clear;

  /// How many rings, evenly spaced out to the reach.
  static const int count = 7;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset centre = origin.alongSize(size);
    final double reach = math.max(size.width, size.height) * 0.62;
    final double step = reach / count;

    final Paint washed = Paint()..color = wash;
    final Paint cleared = Paint()..color = clear;
    final Paint edge = Paint()
      ..color = ring
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    // Outermost first, so each smaller band paints over the one around it.
    for (int index = count; index >= 1; index--) {
      final double radius = step * index;
      canvas.drawCircle(centre, radius, index.isOdd ? washed : cleared);
      canvas.drawCircle(centre, radius, edge);
    }
  }

  @override
  bool shouldRepaint(CareRingsPainter old) =>
      old.origin != origin || old.wash != wash || old.ring != ring || old.clear != clear;
}
