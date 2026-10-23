import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/code_field.dart';
import '../../core/widgets/notice.dart';
import '../auth/sign_up_screen.dart' show resendSeconds;

/// Moving an account to a new phone number.
///
/// The number is how a person signs in and the number every chain rings, so it changes
/// only with proof: the current password where the account has one, then a code sent to
/// the new number. The old number is told afterwards, and every other phone signed in to
/// the account is signed out. Pops with true once the number has changed.
class ChangePhoneScreen extends StatefulWidget {
  const ChangePhoneScreen({super.key});

  @override
  State<ChangePhoneScreen> createState() => _ChangePhoneScreenState();
}

class _ChangePhoneScreenState extends State<ChangePhoneScreen> {
  final GlobalKey<FormState> _numberForm = GlobalKey<FormState>();
  final GlobalKey<FormState> _codeForm = GlobalKey<FormState>();
  final PhoneFieldController _phone = PhoneFieldController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _code = TextEditingController();

  String? _sentTo;
  String? _error;
  bool _busy = false;
  int _cooldown = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  bool get _isElder => context.read<AuthController>().account?.role == Role.elder;

  Future<void> _sendCode() async {
    if (_sentTo == null && !(_numberForm.currentState?.validate() ?? false)) return;
    final String phone = _sentTo ?? _phone.reading.e164!;

    setState(() {
      _busy = true;
      _error = null;
    });
    final String? problem = await context.read<AuthController>().requestPhoneChange(
      phone: phone,
      password: _isElder ? null : _password.text,
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = problem;
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

  Future<void> _confirm() async {
    if (!(_codeForm.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final String? problem = await context.read<AuthController>().changePhone(
      phone: _sentTo!,
      code: _code.text,
    );
    if (!mounted) return;
    if (problem == null) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _busy = false;
      _error = problem;
    });
  }

  void _startOver() {
    _timer?.cancel();
    setState(() {
      _sentTo = null;
      _cooldown = 0;
      _error = null;
      _code.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Change phone number')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            MzaziSpace.s16,
            MzaziSpace.s8,
            MzaziSpace.s16,
            MzaziSpace.s32,
          ),
          child: _sentTo == null ? _numberStep(context) : _codeStep(context),
        ),
      ),
    );
  }

  Widget _numberStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Account? account = context.watch<AuthController>().account;
    final String current = account?.phone ?? '';
    // An elder is not asked for a password somebody else may have set for them.
    final bool elder = account?.role == Role.elder;

    return Form(
      key: _numberForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            'You sign in with your number, and it is the number your care circle rings. '
            'We will text a code to the new one to check it is yours.',
            style: theme.textTheme.bodyLarge,
          ),
          const SizedBox(height: MzaziSpace.s8),
          Text('Now: $current', style: theme.textTheme.bodySmall),
          const SizedBox(height: MzaziSpace.s24),
          PhoneField(controller: _phone, label: 'New phone number'),
          if (!elder) ...<Widget>[
            const SizedBox(height: MzaziSpace.s16),
            TextFormField(
              controller: _password,
              obscureText: true,
              autofillHints: const <String>[AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Current password'),
              validator: (String? v) =>
                  (v == null || v.isEmpty) ? 'Enter your current password.' : null,
            ),
          ],
          if (_error != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s16),
            Notice(message: _error!, isError: true),
          ],
          const SizedBox(height: MzaziSpace.s24),
          FilledButton.icon(
            onPressed: _busy ? null : () => unawaited(_sendCode()),
            icon: const Icon(Icons.sms_outlined),
            label: Text(_busy ? 'Sending' : 'Text a code to the new number'),
          ),
        ],
      ),
    );
  }

  Widget _codeStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Form(
      key: _codeForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            'A six-digit code is on its way to $_sentTo. It works for 10 minutes.',
            style: theme.textTheme.bodyLarge,
          ),
          const SizedBox(height: MzaziSpace.s24),
          if (_error != null) ...<Widget>[
            Notice(message: _error!, isError: true),
            const SizedBox(height: MzaziSpace.s16),
          ],
          CodeField(controller: _code, onSubmitted: (_) => unawaited(_confirm())),
          const SizedBox(height: MzaziSpace.s16),
          Text(
            'Your old number will be told, and any other phone signed in to your account '
            'will be signed out.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: MzaziSpace.s24),
          FilledButton.icon(
            onPressed: _busy ? null : () => unawaited(_confirm()),
            icon: const Icon(Icons.check),
            label: Text(_busy ? 'Changing' : 'Change my number'),
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextButton(
            onPressed: _cooldown > 0 || _busy ? null : () => unawaited(_sendCode()),
            child: Text(_cooldown > 0 ? 'Send a new code in $_cooldown s' : 'Send a new code'),
          ),
          TextButton(onPressed: _startOver, child: const Text('Use a different number')),
        ],
      ),
    );
  }
}
