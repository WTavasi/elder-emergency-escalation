import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The start of a section: its name in small capitals over a hairline.
///
/// This is what replaced the cards. A box round every group says each group matters
/// equally; a label and a rule says where one part ends and the next begins, and leaves
/// the type to say what matters.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {this.trailing, super.key});

  final String text;

  /// An action that belongs to the whole section, set on the right of the label.
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            Expanded(
              child: Semantics(
                header: true,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: MzaziSpace.s8),
                  child: Text(
                    text.toUpperCase(),
                    style: theme.textTheme.labelSmall,
                    semanticsLabel: text,
                  ),
                ),
              ),
            ),
            ?trailing,
          ],
        ),
        const Divider(),
      ],
    );
  }
}
