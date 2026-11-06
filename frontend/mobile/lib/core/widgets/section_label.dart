import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The start of a section: its name in small capitals, above the rounded group it names,
/// as Apple's grouped lists head their groups. The group's edge says where the section
/// is, so there is no rule under the label.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {this.trailing, super.key});

  final String text;

  /// An action that belongs to the whole section, set on the right of the label.
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: MzaziSpace.s8),
      child: Row(
        // On one line of type with the action's words, whatever the button's padding.
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: <Widget>[
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                text.toUpperCase(),
                style: theme.textTheme.labelSmall,
                semanticsLabel: text,
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}
