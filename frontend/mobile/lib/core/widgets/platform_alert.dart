import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// One answer in a [showPlatformAlert].
class AlertAction<T> {
  const AlertAction(this.label, this.value, {this.primary = false, this.destructive = false});

  final String label;

  /// What the alert returns when this is pressed.
  final T value;

  /// The answer the question leads to. A filled button on Android, the bold action on
  /// iPhone.
  final bool primary;

  /// Ends, removes or stops something. Red on both platforms: on Android as a filled
  /// button in the text-safe red, on iPhone as the platform's destructive action.
  final bool destructive;
}

/// A question or a notice in the platform's own alert: iOS's on iPhone, Material's
/// everywhere else.
///
/// An iPhone user knows the iOS alert by heart, and a Material one there is the most
/// recognisable sign of an app ported from somewhere else. The words and the answers are
/// the same on both; only the frame changes.
///
/// Two things are carried over to iOS on purpose. On an elder's screens the alert keeps
/// the elder's type and sizes, because iOS sets an alert's text at 17 points and the
/// elder's floor is 20. And the actions' tint comes from the theme's iOS tint, the focus
/// blue, never the emergency red.
///
/// Returns the pressed action's value, or null if the alert was dismissed some other way.
Future<T?> showPlatformAlert<T>(
  BuildContext context, {
  required String title,
  Widget? content,
  required List<AlertAction<T>> actions,
}) {
  final ThemeData theme = Theme.of(context);
  final bool cupertino =
      theme.platform == TargetPlatform.iOS || theme.platform == TargetPlatform.macOS;

  if (!cupertino) {
    return showDialog<T>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(title),
        content: content,
        actions: <Widget>[
          for (final AlertAction<T> action in actions) _materialAction(dialogContext, action),
        ],
      ),
    );
  }

  // The elder's face is only ever set on the large-type screens.
  final bool large = theme.textTheme.bodyLarge?.fontFamily == MzaziFont.elder;
  final TextStyle? titleStyle = large ? theme.textTheme.titleLarge : null;
  final TextStyle? bodyStyle = large ? theme.textTheme.bodyLarge : null;
  // Without a colour, so iOS still paints the action blue, or red when destructive.
  final TextStyle? actionStyle = large
      ? TextStyle(
          fontFamily: theme.textTheme.labelLarge?.fontFamily,
          fontSize: theme.textTheme.labelLarge?.fontSize,
          fontWeight: theme.textTheme.labelLarge?.fontWeight,
          fontVariations: theme.textTheme.labelLarge?.fontVariations,
        )
      : null;

  return showCupertinoDialog<T>(
    context: context,
    builder: (BuildContext dialogContext) => CupertinoAlertDialog(
      title: titleStyle == null
          ? Text(title)
          : Text(
              title,
              style: titleStyle.copyWith(color: CupertinoColors.label.resolveFrom(dialogContext)),
            ),
      content: content == null
          ? null
          // A Material ancestor, for a text field inside the alert. Material sets its own
          // text style for everything under it, so the alert's own (iOS's face, centred) is
          // read first and handed back, with the elder's body text over it where it applies.
          : Builder(
              builder: (BuildContext inside) {
                final DefaultTextStyle ios = DefaultTextStyle.of(inside);
                final TextStyle style = bodyStyle == null
                    ? ios.style
                    : ios.style.merge(
                        bodyStyle.copyWith(color: CupertinoColors.label.resolveFrom(inside)),
                      );
                return Material(
                  type: MaterialType.transparency,
                  textStyle: style,
                  child: DefaultTextStyle(style: style, textAlign: ios.textAlign, child: content),
                );
              },
            ),
      actions: <Widget>[
        for (final AlertAction<T> action in actions)
          CupertinoDialogAction(
            onPressed: () => Navigator.of(dialogContext).pop(action.value),
            isDefaultAction: action.primary && !action.destructive,
            isDestructiveAction: action.destructive,
            textStyle: actionStyle,
            child: Text(action.label),
          ),
      ],
    ),
  );
}

Widget _materialAction<T>(BuildContext context, AlertAction<T> action) {
  void pop() => Navigator.of(context).pop(action.value);
  final ThemeData theme = Theme.of(context);

  if (action.destructive && action.primary) {
    return FilledButton(
      onPressed: pop,
      style: FilledButton.styleFrom(
        backgroundColor: theme.colorScheme.error,
        foregroundColor: theme.colorScheme.onError,
      ),
      child: Text(action.label),
    );
  }
  if (action.primary) return FilledButton(onPressed: pop, child: Text(action.label));
  return TextButton(onPressed: pop, child: Text(action.label));
}
