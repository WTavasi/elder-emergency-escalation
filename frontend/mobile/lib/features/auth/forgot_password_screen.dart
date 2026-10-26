import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/phone/country.dart';
import '../../core/phone/phone_field.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/password_field.dart';
import '../../core/widgets/step_heading.dart';
import 'auth_frame.dart';
import 'sign_up_screen.dart' show resendSeconds;

/// Setting a new password with a code sent to the phone on the account.
///
/// Two steps on one screen, like sign-up: the number, then the code with the new
/// password, which has a show button rather than a second field to type it in again. Whoever can read an SMS sent to the number owns the account, which is the
/// same proof sign-up asked for, so nothing more is asked here.
///
/// The screen says the same thing whether or not the number has an account, because the
/// server does: telling them apart would let anybody find out who uses MzaziCare.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({this.country, this.number, super.key});

  /// Carried over from the sign-in screen, so nobody types their number twice.
  final Country? country;
  final String? number;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final GlobalKey<FormState> _phoneForm = GlobalKey<FormState>();
  final GlobalKey<FormState> _resetForm = GlobalKey<FormState>();
  late final PhoneFieldController _phone = PhoneFieldController(country: widget.country)
    ..text.text = widget.number ?? '';
  final TextEditingController _code = TextEditingController();
  final TextEditingController _password = TextEditingController();

  /// The number the code went to, once one has been asked for.
  String? _sentTo;
  String? _requestError;
  bool _requesting = false;
  int _cooldown = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    if (_sentTo == null && !(_phoneForm.currentState?.validate() ?? false)) return;

    final String phone = _sentTo ?? _phone.reading.e164!;
    setState(() {
      _requesting = true;
      _requestError = null;
    });
    final String? problem = await context.read<AuthController>().requestPasswordReset(phone);
    if (!mounted) return;

    setState(() {
      _requesting = false;
      _requestError = problem;
      if (problem == null) {
        _sentTo = phone;
        _startCooldown();
      }
    });
  }

  void _startCooldown() {
    _timer?.cancel();
    _cooldown = resendSeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (Timer timer) {
      if (!mounted) return timer.cancel();
      setState(() => _cooldown = _cooldown > 0 ? _cooldown - 1 : 0);
      if (_cooldown == 0) timer.cancel();
    });
  }

  Future<void> _reset() async {
    if (!(_resetForm.currentState?.validate() ?? false)) return;

    final bool done = await context.read<AuthController>().resetPassword(
      phone: _sentTo!,
      code: _code.text,
      newPassword: _password.text,
    );
    // Signed in: the app has already moved to the right home screen underneath. A plain
    // pop, because maybePop would ask the back handler, which goes back to the number.
    if (!done || !mounted) return;
    final NavigatorState navigator = Navigator.of(context);
    if (navigator.canPop()) navigator.pop();
  }

  void _changeNumber() {
    _timer?.cancel();
    context.read<AuthController>().clearError();
    setState(() {
      _sentTo = null;
      _requestError = null;
      _cooldown = 0;
      _code.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    // Back from the code goes to the number, as it would between two pages.
    return PopScope(
      canPop: _sentTo == null,
      onPopInvokedWithResult: (bool didPop, Object? result) {
        if (!didPop) _changeNumber();
      },
      child: Builder(
        builder: (BuildContext context) => AuthFrame(
          onBack: () => unawaited(Navigator.of(context).maybePop()),
          child: _sentTo == null ? _phoneStep(context) : _resetStep(context),
        ),
      ),
    );
  }

  Widget _phoneStep(BuildContext context) {
    return Form(
      key: _phoneForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const StepHeading(
            step: 1,
            title: 'Forgot your password?',
            lead: 'We will send a code by SMS to the number on your account.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          PhoneField(
            controller: _phone,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => unawaited(_sendCode()),
          ),
          if (_requestError != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s16),
            Notice(message: _requestError!, isError: true),
          ],
          const SizedBox(height: MzaziSpace.s24),
          FilledButton(
            onPressed: _requesting ? null : () => unawaited(_sendCode()),
            child: Text(_requesting ? 'Sending' : 'Send me a code'),
          ),
        ],
      ),
    );
  }

  Widget _resetStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AuthController auth = context.watch<AuthController>();
    final String? error = auth.error ?? _requestError;

    return Form(
      key: _resetForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          StepHeading(
            step: 2,
            title: 'Choose a new password',
            lead:
                'If $_sentTo has an account, a six-digit code is on its way by SMS. '
                'It works for 10 minutes.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          if (error != null) ...<Widget>[
            Notice(message: error, isError: true),
            const SizedBox(height: MzaziSpace.s16),
          ],
          TextFormField(
            controller: _code,
            autofocus: true,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.oneTimeCode],
            inputFormatters: <TextInputFormatter>[
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            style: theme.textTheme.headlineSmall?.copyWith(
              fontFeatures: MzaziTheme.figures,
              letterSpacing: 8,
            ),
            decoration: const InputDecoration(labelText: 'Six-digit code'),
            validator: (String? value) =>
                (value?.length ?? 0) == 6 ? null : 'The code has six digits.',
          ),
          const SizedBox(height: MzaziSpace.s16),
          PasswordField(
            controller: _password,
            label: 'New password',
            helperText: 'At least 8 characters',
            newPassword: true,
            onSubmitted: (_) => unawaited(_reset()),
            validator: (String? value) =>
                (value == null || value.length < 8) ? 'Use at least 8 characters.' : null,
          ),
          const SizedBox(height: MzaziSpace.s24),
          FilledButton(
            onPressed: auth.isBusy ? null : () => unawaited(_reset()),
            child: Text(auth.isBusy ? 'Saving' : 'Set my new password'),
          ),
          const SizedBox(height: MzaziSpace.s8),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: MzaziSpace.s8,
            children: <Widget>[
              TextButton(
                onPressed: _cooldown > 0 || _requesting ? null : () => unawaited(_sendCode()),
                child: Text(_cooldown > 0 ? 'Send a new code in $_cooldown s' : 'Send a new code'),
              ),
              TextButton(onPressed: _changeNumber, child: const Text('Use a different number')),
            ],
          ),
        ],
      ),
    );
  }
}
