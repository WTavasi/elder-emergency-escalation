import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/password_field.dart';
import '../../core/widgets/step_heading.dart';
import '../legal/legal_screens.dart';
import 'auth_frame.dart';
import 'code_sign_in_screen.dart';
import 'forgot_password_screen.dart';
import 'sign_up_screen.dart';

/// Phone number and password, which is what the API accepts.
///
/// Phone rather than email because an elder may not have an email address, and the
/// number is already the system's unique handle for a person.
///
/// In two short steps, the number first, as sign-in does where there is more than one
/// way in. The first screen holds only the number and the way to make an account, with
/// the privacy notice and terms in small print. The second asks for the password, and
/// offers an elder who never knew the password a caregiver set a code instead.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final PhoneFieldController _phone = PhoneFieldController();
  final TextEditingController _password = TextEditingController();
  final GlobalKey<FormState> _numberForm = GlobalKey<FormState>();
  final GlobalKey<FormState> _passwordForm = GlobalKey<FormState>();

  /// The number being signed in, once the person has moved on to the password.
  String? _number;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  void _continue() {
    if (!(_numberForm.currentState?.validate() ?? false)) return;
    context.read<AuthController>().clearError();
    setState(() => _number = _phone.reading.e164);
  }

  /// Back to the number, with it still typed in.
  void _changeNumber() {
    context.read<AuthController>().clearError();
    setState(() {
      _number = null;
      _password.clear();
    });
  }

  Future<void> _submit() async {
    if (!(_passwordForm.currentState?.validate() ?? false)) return;

    await context.read<AuthController>().signIn(phone: _number!, password: _password.text);
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

  Future<void> _signInWithCode() async {
    final AuthController auth = context.read<AuthController>()..clearError();
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => CodeSignInScreen(country: _phone.country, number: _phone.text.text),
      ),
    );
    auth.clearError();
  }

  @override
  Widget build(BuildContext context) {
    // Back from the password goes to the number, as it would between two pages, rather
    // than out of the app.
    return PopScope(
      canPop: _number == null,
      onPopInvokedWithResult: (bool didPop, Object? result) {
        if (!didPop) _changeNumber();
      },
      child: _number == null
          ? AuthFrame(tall: true, child: _numberStep(context))
          : AuthFrame(
              onBack: context.watch<AuthController>().isBusy ? null : _changeNumber,
              backLabel: 'Change the number',
              child: _passwordStep(context),
            ),
    );
  }

  Widget _numberStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool busy = context.watch<AuthController>().isBusy;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const StepHeading(title: 'Sign in', lead: 'Enter the number on your account.'),
        const SizedBox(height: MzaziSpace.s24),
        Form(
          key: _numberForm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // Kenya is chosen to begin with; the button in front of the number changes
              // it. Whatever way the number is typed, 0712..., 712... or +254712..., it is
              // sent in the one format the API accepts.
              PhoneField(
                controller: _phone,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _continue(),
              ),
              const SizedBox(height: MzaziSpace.s24),
              FilledButton(onPressed: busy ? null : _continue, child: const Text('Continue')),
            ],
          ),
        ),
        const SizedBox(height: MzaziSpace.s16),
        // For caregivers, family members and volunteers. Elders are registered by their
        // caregiver, and the sign-up screen says so.
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: <Widget>[
            Text('New here?', style: theme.textTheme.bodyLarge),
            TextButton(
              onPressed: busy ? null : () => unawaited(_createAccount()),
              child: const Text('Create an account'),
            ),
          ],
        ),
        const SizedBox(height: MzaziSpace.s8),
        // Readable before an account exists, which is when it matters, but small: few
        // people open them on the way in.
        const Center(child: LegalLinks(quiet: true)),
      ],
    );
  }

  Widget _passwordStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AuthController auth = context.watch<AuthController>();
    final String? error = auth.error;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        StepHeading(title: 'Enter your password', lead: _number!),
        const SizedBox(height: MzaziSpace.s24),
        if (error != null) ...<Widget>[
          Notice(message: error, isError: true),
          const SizedBox(height: MzaziSpace.s16),
        ],
        Form(
          key: _passwordForm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              PasswordField(
                controller: _password,
                label: 'Password',
                autofocus: true,
                onSubmitted: (_) => unawaited(_submit()),
                validator: (String? value) =>
                    (value == null || value.isEmpty) ? 'Enter your password.' : null,
              ),
              // Beside the field it is about, where people look when the password fails.
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(
                  onPressed: auth.isBusy ? null : () => unawaited(_forgotPassword()),
                  child: const Text('Forgot your password?'),
                ),
              ),
              const SizedBox(height: MzaziSpace.s8),
              FilledButton(
                onPressed: auth.isBusy ? null : () => unawaited(_submit()),
                child: Text(auth.isBusy ? 'Signing in' : 'Sign in'),
              ),
            ],
          ),
        ),
        const SizedBox(height: MzaziSpace.s32),
        // An elder may never have known the password a caregiver set.
        Text(
          'No password? Elders can sign in with a code instead.',
          style: theme.textTheme.bodyLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: MzaziSpace.s12),
        OutlinedButton(
          onPressed: auth.isBusy ? null : () => unawaited(_signInWithCode()),
          child: const Text('Sign in with a code'),
        ),
      ],
    );
  }
}
