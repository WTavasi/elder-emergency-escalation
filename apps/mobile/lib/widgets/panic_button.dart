import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The one control this app exists for.
///
/// Built as a circle rather than a rectangle because it has to be findable without
/// being read, and by a hand that may be shaking. Its size comes from the space it is
/// given rather than a fixed number, with [MzaziA11y.elderMinTouchTarget] as the floor
/// it can never go below, so a small phone shrinks it only as far as the accessibility
/// budget allows and a large one lets it fill the screen.
///
/// There is no press animation and no ripple. Feedback is the screen changing to the
/// countdown, which is the thing that actually needs to be noticed.
class PanicButton extends StatelessWidget {
  const PanicButton({
    required this.onPressed,
    required this.label,
    this.enabled = true,
    super.key,
  });

  final VoidCallback onPressed;
  final String label;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double available = constraints.biggest.shortestSide;
        final double diameter = available.isFinite
            ? available.clamp(MzaziA11y.elderMinTouchTarget, 420.0)
            : MzaziA11y.elderMinTouchTarget;

        return Center(
          child: Semantics(
            button: true,
            enabled: enabled,
            // Spelled out for a screen reader, because "Get help" beside a red circle
            // reads very differently from "Get help" alone.
            label: 'Get help now. Alerts the people who look after you.',
            child: SizedBox(
              width: diameter,
              height: diameter,
              child: Material(
                color: enabled
                    ? theme.colorScheme.primary
                    : theme.colorScheme.primary.withValues(alpha: 0.5),
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: enabled ? onPressed : null,
                  child: Padding(
                    padding: const EdgeInsets.all(MzaziSpace.s24),
                    child: Center(
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.displayLarge?.copyWith(
                          color: theme.colorScheme.onPrimary,
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
