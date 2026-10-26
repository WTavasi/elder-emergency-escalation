import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/theme/theme.dart';
import '../../core/widgets/care_rings.dart';

/// The frame every screen on the way in shares: MzaziCare's red across the top, with the
/// care rings in faint white and a curved lower edge, and the form below it on the page.
///
/// The colour fills the space a short form would otherwise leave empty, and puts the form
/// lower on the screen, where the thumb of the hand holding the phone already is. The red
/// is the same in light and dark mode, as the caution yellow is: it is the product's mark
/// here, and a mark does not change colour with the room.
///
/// Scrolls as one piece, so when the keyboard rises the colour moves up out of the way and
/// the field being typed in stays in view.
class AuthFrame extends StatelessWidget {
  const AuthFrame({
    required this.child,
    this.onBack,
    this.backLabel = 'Back',
    this.tall = false,
    super.key,
  });

  /// The form.
  final Widget child;

  /// A back arrow in the colour, for a screen that has somewhere to go back to.
  final VoidCallback? onBack;
  final String backLabel;

  /// The first screen's taller colour, with the product's name set large.
  final bool tall;

  static const Color _red = MzaziColorsLight.emergency;
  static const Color _onRed = MzaziColorsLight.onEmergency;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double margin = MzaziLayout.margin(context);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      // Light status bar text, to read on the red.
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: theme.scaffoldBackgroundColor,
        body: LayoutBuilder(
          builder: (BuildContext context, BoxConstraints constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              // The colour takes whatever the form leaves, so the form sits at the bottom
              // of the screen, in the thumb's reach, and the colour fills the rest. With
              // the keyboard up, or on a long form, the colour keeps its smallest height
              // and the whole page scrolls.
              child: IntrinsicHeight(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Expanded(
                      child: _Colour(
                        least: tall ? 220.0 : 150.0,
                        tall: tall,
                        onBack: onBack,
                        backLabel: backLabel,
                      ),
                    ),
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s8, margin, MzaziSpace.s24),
                        child: Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 480),
                            child: child,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Colour extends StatelessWidget {
  const _Colour({
    required this.least,
    required this.tall,
    required this.onBack,
    required this.backLabel,
  });

  /// The smallest the colour may be, below the status bar.
  final double least;
  final bool tall;
  final VoidCallback? onBack;
  final String backLabel;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double margin = MzaziLayout.margin(context);
    final double top = MediaQuery.paddingOf(context).top;

    return ConstrainedBox(
      constraints: BoxConstraints(minHeight: least + top),
      child: ClipPath(
        clipper: const _CurvedEdge(),
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            const ColoredBox(color: AuthFrame._red),
            ExcludeSemantics(
              child: RepaintBoundary(
                child: CustomPaint(
                  painter: CareRingsPainter(
                    origin: Alignment.topRight,
                    wash: AuthFrame._onRed.withValues(alpha: 0.06),
                    ring: AuthFrame._onRed.withValues(alpha: 0.18),
                    clear: AuthFrame._red,
                  ),
                ),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(margin, top, margin, MzaziSpace.s48),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  SizedBox(
                    height: MzaziSizes.of(context).target,
                    child: onBack == null
                        ? null
                        : Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: IconButton(
                              onPressed: onBack,
                              tooltip: backLabel,
                              color: AuthFrame._onRed,
                              icon: const Icon(Icons.arrow_back),
                            ),
                          ),
                  ),
                  const Spacer(),
                  Text(
                    'MzaziCare',
                    style: (tall ? theme.textTheme.headlineLarge : theme.textTheme.headlineSmall)
                        ?.copyWith(color: AuthFrame._onRed),
                  ),
                  if (tall) ...<Widget>[
                    const SizedBox(height: MzaziSpace.s4),
                    Text(
                      'Emergency help for elders at home',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: AuthFrame._onRed.withValues(alpha: 0.9),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The colour's lower edge: a long, shallow wave, lower on the left and rising to the
/// right, so it reads as the end of the colour rather than a decoration in its own right.
class _CurvedEdge extends CustomClipper<Path> {
  const _CurvedEdge();

  @override
  Path getClip(Size size) {
    final double w = size.width;
    final double h = size.height;
    // The depth of the wave, kept shallow on a short colour.
    final double dip = math.min(h * 0.16, 56);

    return Path()
      ..lineTo(0, h - dip * 0.4)
      ..cubicTo(w * 0.28, h + dip * 0.1, w * 0.52, h - dip * 1.1, w * 0.76, h - dip * 0.75)
      ..cubicTo(w * 0.88, h - dip * 0.6, w * 0.95, h - dip * 0.9, w, h - dip)
      ..lineTo(w, 0)
      ..close();
  }

  @override
  bool shouldReclip(_CurvedEdge oldClipper) => false;
}
