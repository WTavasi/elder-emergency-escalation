import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/theme.dart';

/// A six-digit code box: digits only, spaced wide in the monospace face so each digit
/// can be checked against the text message one at a time, and offered the code from an
/// incoming SMS by the keyboard where the phone can.
class CodeField extends StatelessWidget {
  const CodeField({
    required this.controller,
    this.label = 'Six-digit code',
    this.autofocus = true,
    this.onSubmitted,
    super.key,
  });

  final TextEditingController controller;
  final String label;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return TextFormField(
      controller: controller,
      autofocus: autofocus,
      keyboardType: TextInputType.number,
      textInputAction: onSubmitted == null ? TextInputAction.next : TextInputAction.done,
      autofillHints: const <String>[AutofillHints.oneTimeCode],
      inputFormatters: <TextInputFormatter>[
        FilteringTextInputFormatter.digitsOnly,
        LengthLimitingTextInputFormatter(6),
      ],
      style: theme.textTheme.headlineSmall?.copyWith(
        fontFeatures: MzaziTheme.figures,
        letterSpacing: 8,
      ),
      decoration: InputDecoration(labelText: label),
      onFieldSubmitted: onSubmitted,
      validator: (String? value) => (value?.length ?? 0) == 6 ? null : 'The code has six digits.',
    );
  }
}
