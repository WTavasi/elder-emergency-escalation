import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// A link on the way in, as Apple sets one on a sign-in screen: the words alone, in the
/// tint, with no fill and no underline. Pressed, it dims, as iOS dims a plain button.
///
/// For the few links around signing in and up ("Create an account", the privacy notice
/// and the terms), where a grey pill would weigh as much as the form above it. The tint
/// is MzaziCare's red in its text-safe shade, which these screens already carry across
/// their top. Still a full touch target.
ButtonStyle plainLinkStyle(BuildContext context, {bool small = false}) {
  final ThemeData theme = Theme.of(context);
  final Color tint = theme.colorScheme.error;
  final double target = MzaziSizes.of(context).target;
  final TextStyle? text = (small ? theme.textTheme.bodySmall : theme.textTheme.bodyLarge)?.copyWith(
    fontWeight: FontWeight.w600,
    decoration: TextDecoration.none,
  );

  return ButtonStyle(
    backgroundColor: const WidgetStatePropertyAll<Color>(Colors.transparent),
    overlayColor: const WidgetStatePropertyAll<Color>(Colors.transparent),
    side: const WidgetStatePropertyAll<BorderSide>(BorderSide.none),
    elevation: const WidgetStatePropertyAll<double>(0),
    foregroundColor: WidgetStateProperty.resolveWith(
      (Set<WidgetState> states) => states.contains(WidgetState.pressed)
          ? tint.withValues(alpha: 0.5)
          : states.contains(WidgetState.disabled)
          ? theme.colorScheme.onSurfaceVariant
          : tint,
    ),
    textStyle: WidgetStatePropertyAll<TextStyle?>(text),
    minimumSize: WidgetStatePropertyAll<Size>(Size(target, target)),
    padding: const WidgetStatePropertyAll<EdgeInsetsGeometry>(EdgeInsets.symmetric(horizontal: 8)),
  );
}

/// The same link inside a sentence, for small print: the tint and the weight, no underline.
TextStyle? plainLinkText(BuildContext context, TextStyle? base) => base?.copyWith(
  color: Theme.of(context).colorScheme.error,
  fontWeight: FontWeight.w600,
  decoration: TextDecoration.none,
);
