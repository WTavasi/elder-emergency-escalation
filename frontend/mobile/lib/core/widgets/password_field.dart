import 'package:flutter/material.dart';

/// A password, with a button that shows what was typed.
///
/// Shown on request rather than typed twice: a mistake is seen and put right in the
/// field, not found later by a second field that disagrees with it.
class PasswordField extends StatefulWidget {
  const PasswordField({
    required this.controller,
    required this.label,
    this.helperText,
    this.newPassword = false,
    this.autofocus = false,
    this.textInputAction = TextInputAction.done,
    this.onSubmitted,
    this.validator,
    super.key,
  });

  final TextEditingController controller;
  final String label;
  final String? helperText;

  /// A password being chosen, which a password manager may offer to make up, rather than
  /// one being remembered, which it may offer to fill in.
  final bool newPassword;
  final bool autofocus;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;
  final FormFieldValidator<String>? validator;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _shown = false;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      obscureText: !_shown,
      autofocus: widget.autofocus,
      textInputAction: widget.textInputAction,
      autofillHints: <String>[
        if (widget.newPassword) AutofillHints.newPassword else AutofillHints.password,
      ],
      onFieldSubmitted: widget.onSubmitted,
      validator: widget.validator,
      decoration: InputDecoration(
        labelText: widget.label,
        helperText: widget.helperText,
        suffixIcon: IconButton(
          tooltip: _shown ? 'Hide password' : 'Show password',
          icon: Icon(_shown ? Icons.visibility_off_outlined : Icons.visibility_outlined),
          onPressed: () => setState(() => _shown = !_shown),
        ),
      ),
    );
  }
}
