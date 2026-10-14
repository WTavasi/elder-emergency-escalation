import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The title a screen opens with: large, tight and left-aligned, with an optional line
/// under it that says the one thing worth knowing before reading on.
///
/// Set in the page rather than in an app bar. An app bar title is the same size on every
/// screen; this is the one place on each screen where the type is allowed to be big, so
/// the eye always lands in the same spot first.
class PageTitle extends StatelessWidget {
  const PageTitle(this.title, {this.subtitle, this.subtitleColor, super.key});

  final String title;
  final String? subtitle;

  /// For a subtitle that is a status, such as how many are waiting.
  final Color? subtitleColor;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        MzaziSpace.s16,
        MzaziSpace.s16,
        MzaziSpace.s16,
        MzaziSpace.s16,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(header: true, child: Text(title, style: theme.textTheme.headlineLarge)),
          if (subtitle != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s4),
            Text(
              subtitle!,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: subtitleColor ?? theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
