import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/phone/country.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/notice.dart';
import 'sign_up_screen.dart' show resendSeconds;

/// Setting a new password with a code sent to the phone on the account.
///
/// Two steps on one screen, like sign-up: the number, then the code with the new
/// password. Whoever can read an SMS sent to the number owns the account, which is the
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
  final TextEditingController _confirm = TextEditingController();

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
    _confirm.dispose();
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
    // Signed in: the app has already moved to the right home screen underneath.
    if (done && mounted) await Navigator.of(context).maybePop();
  }

  void _changeNumber() {
    _timer?.cancel();
    context.read<AuthController>().clearError();
    setState(() {
      _sentTo = null;
      _cooldown = 0;
      _code.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reset your password')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              MzaziSpace.s16,
              MzaziSpace.s8,
              MzaziSpace.s16,
              MzaziSpace.s32,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: _sentTo == null ? _phoneStep(context) : _resetStep(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _phoneStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Form(
      key: _phoneForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('Forgot your password?', style: theme.textTheme.titleLarge),
          const SizedBox(height: MzaziSpace.s8),
          Text('We will send a code by SMS.', style: theme.textTheme.bodyLarge),
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
          FilledButton.icon(
            onPressed: _requesting ? null : () => unawaited(_sendCode()),
            icon: const Icon(Icons.sms_outlined),
            label: Text(_requesting ? 'Sending' : 'Send me a code'),
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
          Text('Enter the code', style: theme.textTheme.titleLarge),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            'If $_sentTo has an account, a six-digit code is on its way by SMS. '
            'It works for 10 minutes.',
            style: theme.textTheme.bodyLarge,
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
              fontFamily: MzaziFont.mono,
              letterSpacing: 8,
            ),
            decoration: const InputDecoration(labelText: 'Six-digit code'),
            validator: (String? value) =>
                (value?.length ?? 0) == 6 ? null : 'The code has six digits.',
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _password,
            obscureText: true,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'New password',
              helperText: 'At least 8 characters',
            ),
            validator: (String? value) =>
                (value == null || value.length < 8) ? 'Use at least 8 characters.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _confirm,
            obscureText: true,
            textInputAction: TextInputAction.done,
            decoration: const InputDecoration(labelText: 'New password again'),
            onFieldSubmitted: (_) => unawaited(_reset()),
            validator: (String? value) =>
                value == _password.text ? null : 'The two passwords are different.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          FilledButton.icon(
            onPressed: auth.isBusy ? null : () => unawaited(_reset()),
            icon: const Icon(Icons.lock_reset),
            label: Text(auth.isBusy ? 'Saving' : 'Set my new password'),
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextButton(
            onPressed: _cooldown > 0 || _requesting ? null : () => unawaited(_sendCode()),
            child: Text(_cooldown > 0 ? 'Send a new code in $_cooldown s' : 'Send a new code'),
          ),
          TextButton(onPressed: _changeNumber, child: const Text('Use a different number')),
        ],
      ),
    );
  }
}
