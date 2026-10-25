import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/widgets/motion.dart';

/// The one control this app exists for.
///
/// Built as a circle rather than a rectangle because it has to be findable without
/// being read, and by a hand that may be shaking. Its size comes from the space it is
/// given rather than a fixed number, with [MzaziA11y.elderMinTouchTarget] as the floor
/// it can never go below, so a small phone shrinks it only as far as the accessibility
/// budget allows and a large one lets it fill the screen.
///
/// The floor is enforced with an OverflowBox rather than a SizedBox, because a SizedBox
/// cannot be larger than the constraints handed to it: asked for 72 inside a 20 point
/// box it quietly becomes 20, which is the one outcome this control must never have.
/// Overflowing its parent is the lesser fault. A panic button painting a few points
/// outside its box is untidy; a panic button rendered as a dot is the feature failing.
///
/// A press is felt as well as seen: one firm vibration the moment it registers, before
/// the screen changes to the countdown, so somebody who cannot read the screen still
/// knows it took.
class PanicButton extends StatelessWidget {
  const PanicButton({required this.onPressed, required this.label, this.enabled = true, super.key});

  final VoidCallback onPressed;
  final String label;
  final bool enabled;

  /// How big the circle is in the space it is given: as large as fits, up to 420
  /// points, and never below the elder touch target.
  ///
  /// The countdown's ring takes its size from here too, so pressing the button turns the
  /// red disc into a ring of exactly the same size in exactly the same place.
  static double diameterFor(Size available) {
    final double side = available.shortestSide;
    return side.isFinite
        ? side.clamp(MzaziA11y.elderMinTouchTarget, 420.0)
        : MzaziA11y.elderMinTouchTarget;
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double diameter = diameterFor(constraints.biggest);

        return Center(
          child: Semantics(
            button: true,
            enabled: enabled,
            // Spelled out for a screen reader, because "Get help" beside a red circle
            // reads very differently from "Get help" alone.
            label: 'Get help now. Alerts the people who look after you.',
            child: OverflowBox(
              minWidth: diameter,
              maxWidth: diameter,
              minHeight: diameter,
              maxHeight: diameter,
              child: Material(
                // Disabled is grey with dark ink, not the red faded to half. Half-red with
                // white ink was 2.9:1, and looked like a button that had broken rather
                // than one that is busy.
                color: enabled
                    ? theme.colorScheme.primary
                    : theme.colorScheme.surfaceContainerHighest,
                // In dark mode the brand red is about 2:1 against the page, under the 3:1 a
                // control's outline needs, so the circle gets a brighter red edge there.
                // In light mode the red stands off the page by itself.
                shape: CircleBorder(
                  side: enabled && theme.brightness == Brightness.dark
                      ? const BorderSide(
                          color: MzaziColorsDark.emergencyEdge,
                          width: MzaziStroke.rule,
                        )
                      : BorderSide.none,
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: enabled
                      ? () {
                          unawaited(Haptics.confirm());
                          onPressed();
                        }
                      : null,
                  child: Padding(
                    padding: const EdgeInsets.all(MzaziSpace.s24),
                    child: Center(
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.displayLarge?.copyWith(
                          color: enabled
                              ? theme.colorScheme.onPrimary
                              : theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
