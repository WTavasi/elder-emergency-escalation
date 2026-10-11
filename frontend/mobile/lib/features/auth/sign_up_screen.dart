import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/notice.dart';

/// Seconds before another code can be asked for. Matches the server's own cooldown, so
/// the button never offers something the server would quietly ignore.
const int resendSeconds = 30;

/// Creating an account, for a caregiver or a family member.
///
/// Two steps on one screen. The details first, then a six-digit code sent to the phone,
/// which proves the number belongs to whoever is typing it. Elders do not sign up here:
/// their caregiver registers them, so that the consent given on their behalf says who
/// gave it, and the screen says so rather than leaving an elder to find out.
class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final GlobalKey<FormState> _details = GlobalKey<FormState>();
  final GlobalKey<FormState> _codeForm = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final PhoneFieldController _phone = PhoneFieldController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirm = TextEditingController();
  final TextEditingController _code = TextEditingController();

  Role _role = Role.caregiver;
  bool _accepted = false;
  bool _showPrivacyError = false;

  /// The number the code went to, once one has been asked for.
  String? _sentTo;
  String? _requestError;
  bool _requesting = false;
  int _cooldown = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    for (final TextEditingController controller in <TextEditingController>[
      _name,
      _email,
      _password,
      _confirm,
      _code,
    ]) {
      controller.dispose();
    }
    _phone.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final bool valid = _details.currentState?.validate() ?? false;
    setState(() => _showPrivacyError = !_accepted);
    if (!valid || !_accepted) return;

    final String phone = _phone.reading.e164!;
    setState(() {
      _requesting = true;
      _requestError = null;
    });
    final String? problem = await context.read<AuthController>().requestCode(phone);
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

  Future<void> _create() async {
    if (!(_codeForm.currentState?.validate() ?? false)) return;

    final bool created = await context.read<AuthController>().signUp(
      name: _name.text,
      phone: _sentTo!,
      code: _code.text,
      password: _password.text,
      role: _role,
      email: _email.text,
    );
    // Signed in: the app has already switched to the right home screen underneath this
    // one, so all that is left is to get out of its way.
    if (created && mounted) await Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create an account')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(MzaziSpace.s24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: _sentTo == null ? _detailsStep(context) : _codeStep(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _detailsStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Form(
      key: _details,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const Notice(
            message:
                'For caregivers and family members. An elder is registered by their caregiver, '
                'from the caregiver\'s own account.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          Text('I am', style: theme.textTheme.titleMedium),
          const SizedBox(height: MzaziSpace.s8),
          SegmentedButton<Role>(
            segments: const <ButtonSegment<Role>>[
              ButtonSegment<Role>(
                value: Role.caregiver,
                label: Text('A caregiver'),
                icon: Icon(Icons.volunteer_activism_outlined),
              ),
              ButtonSegment<Role>(
                value: Role.familyMember,
                label: Text('Family'),
                icon: Icon(Icons.family_restroom),
              ),
            ],
            selected: <Role>{_role},
            showSelectedIcon: false,
            style: const ButtonStyle(
              minimumSize: WidgetStatePropertyAll<Size>(Size(0, MzaziA11y.standardMinTouchTarget)),
            ),
            onSelectionChanged: (Set<Role> chosen) => setState(() => _role = chosen.first),
          ),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            _role == Role.caregiver
                ? 'You look after somebody day to day and will be asked first. You can register them once your account exists.'
                : 'A caregiver adds you to the person you are family to. Sign up with the number they used.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: MzaziSpace.s24),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.name],
            decoration: const InputDecoration(labelText: 'Your name'),
            validator: (String? value) =>
                (value == null || value.trim().length < 2) ? 'Enter your name.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          PhoneField(controller: _phone, label: 'Your phone number'),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Email (optional)'),
            validator: (String? value) {
              final String email = value?.trim() ?? '';
              if (email.isEmpty) return null;
              return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)
                  ? null
                  : 'That does not look like an email address.';
            },
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _password,
            obscureText: true,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'Password',
              helperText: 'At least 8 characters',
            ),
            validator: (String? value) => (value == null || value.length < 8)
                ? 'Use at least 8 characters.'
                : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _confirm,
            obscureText: true,
            textInputAction: TextInputAction.done,
            decoration: const InputDecoration(labelText: 'Password again'),
            validator: (String? value) =>
                value == _password.text ? null : 'The two passwords are different.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          const _WhatWeKeep(),
          CheckboxListTile(
            value: _accepted,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text('I have read what MzaziCare keeps about me, and I agree'),
            subtitle: _showPrivacyError && !_accepted
                ? Text(
                    'You need to agree before an account can be made.',
                    style: TextStyle(color: theme.colorScheme.error),
                  )
                : null,
            onChanged: (bool? value) => setState(() => _accepted = value ?? false),
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

  Widget _codeStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AuthController auth = context.watch<AuthController>();
    final String? error = auth.error;

    return Form(
      key: _codeForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('Enter the code', style: theme.textTheme.headlineSmall),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            'If $_sentTo can receive it, a six-digit code is on its way by SMS. It works for 10 minutes.',
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
            textInputAction: TextInputAction.done,
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
            onFieldSubmitted: (_) => unawaited(_create()),
            validator: (String? value) =>
                (value?.length ?? 0) == 6 ? null : 'The code has six digits.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          FilledButton.icon(
            onPressed: auth.isBusy ? null : () => unawaited(_create()),
            icon: const Icon(Icons.check),
            label: Text(auth.isBusy ? 'Creating your account' : 'Create my account'),
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextButton(
            onPressed: _cooldown > 0 || _requesting ? null : () => unawaited(_sendCode()),
            child: Text(_cooldown > 0 ? 'Send a new code in $_cooldown s' : 'Send a new code'),
          ),
          TextButton(
            onPressed: () => setState(() {
              _sentTo = null;
              _code.clear();
              auth.clearError();
            }),
            child: const Text('Change my details'),
          ),
        ],
      ),
    );
  }
}

/// What the account holds, said before anybody agrees to it. The full notice lives in
/// the project documentation; this is the part a person needs at the moment of signing.
class _WhatWeKeep extends StatelessWidget {
  const _WhatWeKeep();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ExpansionTile(
        leading: const Icon(Icons.privacy_tip_outlined),
        title: const Text('What MzaziCare keeps about you'),
        childrenPadding: const EdgeInsets.fromLTRB(
          MzaziSpace.s16,
          0,
          MzaziSpace.s16,
          MzaziSpace.s16,
        ),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: const <Widget>[
          Text(
            'Your name, phone number, email if you give one, and a scrambled form of your '
            'password that cannot be turned back into it.\n\n'
            'The emergencies you are asked to help with, and what you did about each one. '
            'Closed emergencies are deleted after a year.\n\n'
            'Your phone number is shared only with the people in the same care circle, '
            'so they can call you during an emergency.\n\n'
            'MzaziCare never reads your phone\'s location.',
          ),
        ],
      ),
    );
  }
}
