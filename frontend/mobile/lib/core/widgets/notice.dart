import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// Something the person needs to read, marked so a screen reader announces it.
class Notice extends StatelessWidget {
  const Notice({required this.message, this.isError = false, super.key});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(MzaziSpace.s16),
        decoration: BoxDecoration(
          color: isError ? theme.colorScheme.error : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(MzaziRadius.card),
          border: Border.all(color: isError ? theme.colorScheme.error : theme.dividerColor),
        ),
        child: Text(
          message,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: isError ? theme.colorScheme.onError : theme.textTheme.bodyLarge?.color,
          ),
        ),
      ),
    );
  }
}
