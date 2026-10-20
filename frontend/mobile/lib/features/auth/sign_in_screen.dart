import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/phone/phone_field.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/care_rings.dart';
import '../../core/widgets/notice.dart';
import 'forgot_password_screen.dart';
import 'sign_up_screen.dart';

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
  final PhoneFieldController _phone = PhoneFieldController();
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
      phone: _phone.reading.e164!,
      password: _password.text,
    );
  }

  Future<void> _createAccount() async {
    final AuthController auth = context.read<AuthController>()..clearError();
    await Navigator.of(context)
        .push<void>(MaterialPageRoute<void>(builder: (_) => const SignUpScreen()));
    // A sign-up that succeeded has already signed in, and the app has moved on; one
    // that was abandoned should not leave its error on this screen.
    auth.clearError();
  }

  Future<void> _forgotPassword() async {
    final AuthController auth = context.read<AuthController>()..clearError();
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        // Whatever was typed here is carried over, so nobody types their number twice.
        builder: (_) => ForgotPasswordScreen(country: _phone.country, number: _phone.text.text),
      ),
    );
    auth.clearError();
  }

  @override
  Widget build(BuildContext context) {
    final AuthController auth = context.watch<AuthController>();
    final ThemeData theme = Theme.of(context);
    final String? error = auth.error;

    return Scaffold(
      body: CareRings(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(MzaziSpace.s24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    // The same wordmark the console's sign-in carries, so the first
                    // screen on either looks like one product. Type only: there is no
                    // logo, and inventing one is not this project's job.
                    Text(
                      'MzaziCare',
                      style: theme.textTheme.headlineLarge?.weighted(FontWeight.w700),
                    ),
                    const SizedBox(height: MzaziSpace.s4),
                    Text(
                      'Emergency help for elders at home',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.textTheme.bodySmall?.color,
                      ),
                    ),
                    const SizedBox(height: MzaziSpace.s32),
                    // Straight on the page, no card. The fields are filled, so nothing that
                    // has to be read sits on the rings behind them.
                    Form(
                      key: _form,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: <Widget>[
                          Text('Sign in', style: theme.textTheme.titleLarge),
                          const SizedBox(height: MzaziSpace.s16),
                          if (error != null) ...<Widget>[
                            Notice(message: error, isError: true),
                            const SizedBox(height: MzaziSpace.s16),
                          ],
                          // Kenya is chosen to begin with; the button in front of the
                          // number changes it. Whatever way the number is typed,
                          // 0712..., 712... or +254712..., it is sent in the one format
                          // the API accepts.
                          PhoneField(controller: _phone),
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
                          const SizedBox(height: MzaziSpace.s8),
                          TextButton(
                            onPressed: auth.isBusy ? null : () => unawaited(_forgotPassword()),
                            child: const Text('Forgot your password?'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: MzaziSpace.s16),
                    // For caregivers and family members. Elders are registered by their
                    // caregiver, and the sign-up screen says so.
                    OutlinedButton(
                      // Filled like the fields, so the rings do not show through it.
                      style: OutlinedButton.styleFrom(backgroundColor: theme.colorScheme.surface),
                      onPressed: auth.isBusy ? null : () => unawaited(_createAccount()),
                      child: const Text('New here? Create an account'),
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
