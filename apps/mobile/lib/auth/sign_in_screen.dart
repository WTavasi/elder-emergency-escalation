import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../widgets/notice.dart';
import 'auth_controller.dart';

/// Phone number and password, which is what the API accepts.
///
/// Phone rather than email because an elder may not have an email address, and the
/// number is already the system's unique handle for a person.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final TextEditingController _phone = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final GlobalKey<FormState> _form = GlobalKey<FormState>();

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;

    await context.read<AuthController>().signIn(
          phone: _phone.text,
          password: _password.text,
        );
  }

  @override
  Widget build(BuildContext context) {
    final AuthController auth = context.watch<AuthController>();
    final ThemeData theme = Theme.of(context);
    final String? error = auth.error;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(MzaziSpace.s24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Text('MzaziCare', style: theme.textTheme.headlineLarge),
                    const SizedBox(height: MzaziSpace.s8),
                    Text('Sign in to get help quickly.', style: theme.textTheme.bodyLarge),
                    const SizedBox(height: MzaziSpace.s24),
                    if (error != null) ...<Widget>[
                      Notice(message: error, isError: true),
                      const SizedBox(height: MzaziSpace.s16),
                    ],
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      autofillHints: const <String>[AutofillHints.telephoneNumber],
                      decoration: const InputDecoration(
                        labelText: 'Phone number',
                        hintText: '+254700000010',
                      ),
                      validator: (String? value) =>
                          (value == null || value.trim().length < 8)
                              ? 'Enter the phone number this account uses.'
                              : null,
                    ),
                    const SizedBox(height: MzaziSpace.s16),
                    TextFormField(
                      controller: _password,
                      obscureText: true,
                      textInputAction: TextInputAction.done,
                      autofillHints: const <String>[AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Password'),
                      onFieldSubmitted: (_) => unawaited(_submit()),
                      validator: (String? value) =>
                          (value == null || value.isEmpty) ? 'Enter your password.' : null,
                    ),
                    const SizedBox(height: MzaziSpace.s24),
                    FilledButton(
                      onPressed: auth.isBusy ? null : () => unawaited(_submit()),
                      child: Text(auth.isBusy ? 'Signing in' : 'Sign in'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
