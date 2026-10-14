import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// Something the person needs to read, marked so a screen reader announces it.
///
/// A rule down the left and the words beside it, with no box. A filled red box was the
/// loudest thing on any screen it appeared on, louder than the emergency it was often
/// about, and in dark mode its white-on-red failed contrast. An error now reads in the
/// text-safe red from the tokens; anything else in ordinary ink.
class Notice extends StatelessWidget {
  const Notice({required this.message, this.isError = false, super.key});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color ink = isError ? theme.colorScheme.error : theme.colorScheme.onSurface;

    return Semantics(
      liveRegion: true,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Container(width: MzaziStroke.rule, color: ink),
            const SizedBox(width: MzaziSpace.s12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s4),
                child: Text(message, style: theme.textTheme.bodyLarge?.copyWith(color: ink)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
