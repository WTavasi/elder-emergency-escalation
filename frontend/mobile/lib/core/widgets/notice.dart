import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// Something the person needs to read, marked so a screen reader announces it.
///
/// An icon and the words beside it, with no box. A filled red box was the loudest thing
/// on any screen it appeared on, louder than the emergency it was often about, and in dark
/// mode its white-on-red failed contrast. A coloured rule down the left edge replaced it,
/// and that went too: a side stripe is the decoration the design guidance this app follows
/// rules out. An error now reads in the text-safe red from the tokens with an error mark;
/// anything else in ordinary ink with an information mark, so the two differ in shape as
/// well as colour.
class Notice extends StatelessWidget {
  const Notice({required this.message, this.isError = false, super.key});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color ink = isError ? theme.colorScheme.error : theme.colorScheme.onSurface;
    final TextStyle? style = theme.textTheme.bodyLarge?.copyWith(color: ink);
    // Sized to the text and centred on its first line, however large the type is.
    final double size = (style?.fontSize ?? MzaziTypeStandard.body) * 1.25;
    final double line = (style?.fontSize ?? MzaziTypeStandard.body) * (style?.height ?? 1.5);

    return Semantics(
      liveRegion: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: EdgeInsets.only(top: (line - size) / 2),
            child: Icon(isError ? Icons.error_outline : Icons.info_outline, color: ink, size: size),
          ),
          const SizedBox(width: MzaziSpace.s12),
          Expanded(child: Text(message, style: style)),
        ],
      ),
    );
  }
}
