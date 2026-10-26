import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/phone/phone_field.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/password_field.dart';
import '../../core/widgets/step_heading.dart';
import '../legal/legal_screens.dart';

/// Seconds before another code can be asked for. Matches the server's own cooldown, so
/// the button never offers something the server would quietly ignore.
const int resendSeconds = 30;

/// Creating an account, for a caregiver, a family member or a community volunteer.
///
/// Two short steps, as phone-first sign-ups do. Who you are and your number first, then
/// the six-digit code sent to that number, which proves it belongs to whoever is typing
/// it, with a password chosen beside it. Elders do not sign up here: their caregiver
/// registers them, so that the consent given on their behalf says who gave it, and the
/// screen says so rather than leaving an elder to find out.
///
/// Only what an account cannot exist without is asked for. An email can be added later on
/// the account page, and the password has a show button instead of being typed twice.
/// The terms and the privacy notice are agreed to by pressing "Agree and send a code",
/// with both one tap away in the small print under it, rather than in front of the form.
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
  final TextEditingController _code = TextEditingController();
  final TextEditingController _password = TextEditingController();

  Role _role = Role.caregiver;

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
      _code,
      _password,
    ]) {
      controller.dispose();
    }
    _phone.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    // Asking again from the code step, where the details form is no longer on screen.
    if (_sentTo == null && !(_details.currentState?.validate() ?? false)) return;

    final String phone = _sentTo ?? _phone.reading.e164!;
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

  /// Back to the first step, with what was typed there kept.
  void _changeDetails() => setState(() {
    _sentTo = null;
    _requestError = null;
    _code.clear();
    context.read<AuthController>().clearError();
  });

  Future<void> _create() async {
    if (!(_codeForm.currentState?.validate() ?? false)) return;

    final bool created = await context.read<AuthController>().signUp(
      name: _name.text,
      phone: _sentTo!,
      code: _code.text,
      password: _password.text,
      role: _role,
    );
    // Signed in: the app has already switched to the right home screen underneath this
    // one, so all that is left is to get out of its way. A plain pop, because maybePop
    // would ask the back handler above, which takes back from the code to the first step.
    if (!created || !mounted) return;
    final NavigatorState navigator = Navigator.of(context);
    if (navigator.canPop()) navigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    // The caregiver's type, not the larger sign-in type. Nobody here is an elder: elders
    // are registered by their caregiver, never through this screen, so the larger sizes
    // the screens before sign-in keep for them would only make a long form longer.
    final bool dark = Theme.of(context).brightness == Brightness.dark;
    return Theme(
      data: dark ? MzaziTheme.dark(AppAudience.standard) : MzaziTheme.light(AppAudience.standard),
      // Back from the code goes to the first step, as it would between two pages, rather
      // than out of signing up altogether.
      child: PopScope(
        canPop: _sentTo == null,
        onPopInvokedWithResult: (bool didPop, Object? result) {
          if (!didPop) _changeDetails();
        },
        child: Builder(
          builder: (BuildContext context) => Scaffold(
            appBar: AppBar(),
            body: SafeArea(
              // From the top, not the middle, so the heading of each step is in the same
              // place and the second step does not jump on arriving.
              child: Align(
                alignment: Alignment.topCenter,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    MzaziSpace.s16,
                    MzaziSpace.s8,
                    MzaziSpace.s16,
                    MzaziSpace.s32,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: _sentTo == null ? _detailsStep(context) : _codeStep(context),
                  ),
                ),
              ),
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
          const StepHeading(
            step: 1,
            title: 'Create your account',
            lead:
                'For caregivers, family and volunteers. An elder is registered by their '
                'caregiver.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          Text('I am', style: theme.textTheme.titleMedium),
          const SizedBox(height: MzaziSpace.s8),
          // Words alone: with icons beside them the three no longer fit across a phone,
          // and "Volunteer" broke in the middle of the word.
          SegmentedButton<Role>(
            segments: const <ButtonSegment<Role>>[
              ButtonSegment<Role>(value: Role.caregiver, label: Text('Caregiver')),
              ButtonSegment<Role>(value: Role.familyMember, label: Text('Family')),
              ButtonSegment<Role>(value: Role.communityResponder, label: Text('Volunteer')),
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
            switch (_role) {
              Role.caregiver =>
                'You look after somebody day to day and will be asked first. You can register them once your account exists.',
              Role.communityResponder =>
                'You can be asked to help older people living near you. You apply once your account exists, and nobody asks you anything until an administrator approves it.',
              _ =>
                'A caregiver adds you to the person you are family to. Sign up with the number they used.',
            },
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
          PhoneField(
            controller: _phone,
            label: 'Your phone number',
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => unawaited(_sendCode()),
          ),
          if (_requestError != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s16),
            Notice(message: _requestError!, isError: true),
          ],
          const SizedBox(height: MzaziSpace.s32),
          FilledButton(
            onPressed: _requesting ? null : () => unawaited(_sendCode()),
            child: Text(_requesting ? 'Sending' : 'Agree and send a code'),
          ),
          const SizedBox(height: MzaziSpace.s16),
          const _SmallPrint(),
        ],
      ),
    );
  }

  Widget _codeStep(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AuthController auth = context.watch<AuthController>();
    final String? error = auth.error ?? _requestError;

    return Form(
      key: _codeForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          StepHeading(
            step: 2,
            title: 'Check your messages',
            lead:
                'If $_sentTo can receive it, a six-digit code is on its way by SMS. It works '
                'for 10 minutes.',
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
          PasswordField(
            controller: _password,
            label: 'Choose a password',
            helperText: 'At least 8 characters',
            newPassword: true,
            onSubmitted: (_) => unawaited(_create()),
            validator: (String? value) =>
                (value == null || value.length < 8) ? 'Use at least 8 characters.' : null,
          ),
          const SizedBox(height: MzaziSpace.s32),
          FilledButton(
            onPressed: auth.isBusy ? null : () => unawaited(_create()),
            child: Text(auth.isBusy ? 'Creating your account' : 'Create my account'),
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
              TextButton(onPressed: _changeDetails, child: const Text('Change my details')),
            ],
          ),
        ],
      ),
    );
  }
}

/// The terms and the privacy notice, under the button that agrees to them. Small, because
/// few people open them while signing up, but in the sentence that says what the button
/// does, so the agreement is never hidden.
class _SmallPrint extends StatefulWidget {
  const _SmallPrint();

  @override
  State<_SmallPrint> createState() => _SmallPrintState();
}

class _SmallPrintState extends State<_SmallPrint> {
  late final TapGestureRecognizer _terms = TapGestureRecognizer()
    ..onTap = () => unawaited(_open(const TermsScreen()));
  late final TapGestureRecognizer _privacy = TapGestureRecognizer()
    ..onTap = () => unawaited(_open(const PrivacyNoticeScreen()));

  Future<void> _open(Widget screen) =>
      Navigator.of(context).push<void>(MaterialPageRoute<void>(builder: (_) => screen));

  @override
  void dispose() {
    _terms.dispose();
    _privacy.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final TextStyle? base = theme.textTheme.bodySmall;
    final TextStyle? link = base?.copyWith(
      color: theme.colorScheme.onSurface,
      decoration: TextDecoration.underline,
    );

    return Text.rich(
      TextSpan(
        style: base,
        children: <InlineSpan>[
          const TextSpan(text: 'By continuing you agree to the '),
          TextSpan(text: 'terms of use', style: link, recognizer: _terms),
          const TextSpan(text: ' and confirm you have read the '),
          TextSpan(text: 'privacy notice', style: link, recognizer: _privacy),
          const TextSpan(text: ', which says what MzaziCare keeps about you.'),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}
