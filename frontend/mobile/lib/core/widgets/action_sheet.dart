import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../theme/theme.dart';

/// One row in a [showActionSheet].
class SheetAction<T> {
  const SheetAction(
    this.label,
    this.value, {
    this.icon,
    this.primary = false,
    this.destructive = false,
    this.selected = false,
  });

  final String label;

  /// What the sheet returns when this row is pressed.
  final T value;

  /// Shown before the words, so each row can be told apart at a glance.
  final IconData? icon;

  /// The answer the question leads to: a full-width button above the other rows, as the
  /// main action of an iPhone sheet is, red when it is also [destructive].
  final bool primary;

  /// Ends, removes or stops something. In the text-safe red, as iOS colours a
  /// destructive action.
  final bool destructive;

  /// The choice already in place, for a sheet that picks one of several. Ticked.
  final bool selected;
}

/// A question, a choice or a notice, as a sheet that slides up from the bottom.
///
/// One shape for every pop-up in the app, after the action sheets an iPhone uses when
/// somebody has chosen to do something: a grab handle, rounded top corners, a short title,
/// a line saying what will happen, then the answers as rows with an icon each, the ones
/// that act first and the way back out last. It sits where the thumb already is, and it
/// is dismissed the way every iPhone sheet is, by swiping it down.
///
/// The rows appear in the order given, which puts the way back out last, as iOS places
/// Cancel at the foot of a sheet.
///
/// [content] is for anything more than words, such as a text field: the sheet rises with
/// the keyboard so the field is never hidden behind it.
///
/// Returns the pressed row's value, or null if the sheet was dismissed.
Future<T?> showActionSheet<T>(
  BuildContext context, {
  required String title,
  String? message,
  Widget? content,
  required List<SheetAction<T>> actions,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (BuildContext sheetContext) =>
        _ActionSheet<T>(title: title, message: message, content: content, actions: actions),
  );
}

class _ActionSheet<T> extends StatelessWidget {
  const _ActionSheet({
    required this.title,
    required this.message,
    required this.content,
    required this.actions,
  });

  final String title;
  final String? message;
  final Widget? content;
  final List<SheetAction<T>> actions;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double margin = MzaziLayout.margin(context);

    return Padding(
      // Rises with the keyboard, for a sheet with a text field in it.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(margin, 0, margin, MzaziSpace.s16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Semantics(header: true, child: Text(title, style: theme.textTheme.titleLarge)),
            if (message != null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s8),
              Text(message!, style: theme.textTheme.bodyLarge),
            ],
            if (content != null) ...<Widget>[const SizedBox(height: MzaziSpace.s16), content!],
            const SizedBox(height: MzaziSpace.s16),
            for (final SheetAction<T> action in actions)
              if (action.primary) ...<Widget>[
                _Button<T>(action: action),
                const SizedBox(height: MzaziSpace.s8),
              ] else
                _Row<T>(action: action),
          ],
        ),
      ),
    );
  }
}

class _Row<T> extends StatelessWidget {
  const _Row({required this.action});

  final SheetAction<T> action;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final MzaziSizes sizes = MzaziSizes.of(context);
    final Color colour = action.destructive ? theme.colorScheme.error : theme.colorScheme.onSurface;
    final TextStyle? style = theme.textTheme.bodyLarge?.copyWith(color: colour);

    return Semantics(
      button: true,
      selected: action.selected,
      child: InkWell(
        borderRadius: BorderRadius.circular(MzaziRadius.field),
        onTap: () => Navigator.of(context).pop(action.value),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: sizes.target + MzaziSpace.s4),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s8),
            child: Row(
              children: <Widget>[
                if (action.icon != null) ...<Widget>[
                  Icon(action.icon, color: colour),
                  const SizedBox(width: MzaziSpace.s16),
                ],
                Expanded(child: Text(action.label, style: style)),
                if (action.selected)
                  Icon(Icons.check, color: theme.colorScheme.onSurface, semanticLabel: 'Chosen'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Button<T> extends StatelessWidget {
  const _Button({required this.action});

  final SheetAction<T> action;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    void pop() => Navigator.of(context).pop(action.value);
    final ButtonStyle? style = action.destructive
        ? FilledButton.styleFrom(
            backgroundColor: theme.colorScheme.error,
            foregroundColor: theme.colorScheme.onError,
          )
        : null;

    return action.icon == null
        ? FilledButton(onPressed: pop, style: style, child: Text(action.label))
        : FilledButton.icon(
            onPressed: pop,
            style: style,
            icon: Icon(action.icon),
            label: Text(action.label),
          );
  }
}
