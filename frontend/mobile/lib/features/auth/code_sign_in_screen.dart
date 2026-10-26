import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/phone/country.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/code_field.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/step_heading.dart';
import 'sign_up_screen.dart' show resendSeconds;

/// An elder signing in with a code instead of a password.
///
/// A password somebody else chose at registration is the most likely thing to keep an
/// elder from the panic button after a sign-out, a new phone or a reinstall. So an elder
/// can sign in with a code: one sent by text to their own number, or one their caregiver
/// makes on the elder's page and reads out or types in. Both go in the same box.
///
/// Only an elder's number is ever sent a code. The screen says the same whatever number
/// is typed, because the server does.
class CodeSignInScreen extends StatefulWidget {
  const CodeSignInScreen({this.country, this.number, super.key});

  /// Carried over from the sign-in screen, so nobody types their number twice.
  final Country? country;
  final String? number;

  @override
  State<CodeSignInScreen> createState() => _CodeSignInScreenState();
}

class _CodeSignInScreenState extends State<CodeSignInScreen> {
  final GlobalKey<FormState> _phoneForm = GlobalKey<FormState>();
  final GlobalKey<FormState> _codeForm = GlobalKey<FormState>();
  late final PhoneFieldController _phone = PhoneFieldController(country: widget.country)
    ..text.text = widget.number ?? '';
  final TextEditingController _code = TextEditingController();

  /// The number being signed in, once the person has moved on to the code.
  String? _phoneNumber;

  /// Whether a code was asked for by text, rather than brought from a caregiver.
  bool _texted = false;
  String? _requestError;
  bool _requesting = false;
  int _cooldown = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _textCode() async {
    if (_phoneNumber == null && !(_phoneForm.currentState?.validate() ?? false)) return;

    final String phone = _phoneNumber ?? _phone.reading.e164!;
    setState(() {
      _requesting = true;
      _requestError = null;
    });
    final String? problem = await context.read<AuthController>().requestSignInCode(phone);
    if (!mounted) return;

    setState(() {
      _requesting = false;
      _requestError = problem;
      if (problem == null) {
        _phoneNumber = phone;
        _texted = true;
        _startCooldown();
      }
    });
  }

  /// Straight to the code box, with nothing sent: the caregiver has the code.
  void _haveCode() {
    if (!(_phoneForm.currentState?.validate() ?? false)) return;
    setState(() {
      _phoneNumber = _phone.reading.e164;
      _texted = false;
      _requestError = null;
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

  Future<void> _signIn() async {
    if (!(_codeForm.currentState?.validate() ?? false)) return;
    final bool done = await context.read<AuthController>().signInWithCode(
      phone: _phoneNumber!,
      code: _code.text,
    );
    // Signed in: the app has already moved to the elder's home screen underneath. A plain
    // pop, because maybePop would ask the back handler, which goes back to the number.
    if (!done || !mounted) return;
    final NavigatorState navigator = Navigator.of(context);
    if (navigator.canPop()) navigator.pop();
  }

  void _changeNumber() {
    _timer?.cancel();
    context.read<AuthController>().clearError();
    setState(() {
      _phoneNumber = null;
      _texted = false;
      _requestError = null;
      _cooldown = 0;
      _code.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    // Back from the code goes to the number, as it would between two pages.
    return PopScope(
      canPop: _phoneNumber == null,
      onPopInvokedWithResult: (bool didPop, Object? result) {
        if (!didPop) _changeNumber();
      },
      child: Scaffold(
        appBar: AppBar(),
        body: SafeArea(
          // From the top, so the heading of each step is in the same place.
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
                constraints: const BoxConstraints(maxWidth: 440),
                child: _phoneNumber == null ? _phoneStep(context) : _codeStep(context),
              ),
            ),
          ),
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
            title: 'No password needed',
            lead:
                'For elders. Use the number of this phone, then a code we text to it, or a '
                'code from your caregiver.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          PhoneField(controller: _phone, textInputAction: TextInputAction.done),
          if (_requestError != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s16),
            Notice(message: _requestError!, isError: true),
          ],
          const SizedBox(height: MzaziSpace.s24),
          // Words alone, so the longer of the two fits on one line at the elder's size.
          SizedBox(
            height: MzaziA11y.elderMinTouchTarget,
            child: FilledButton(
              onPressed: _requesting ? null : () => unawaited(_textCode()),
              child: Text(_requesting ? 'Sending' : 'Text me a code'),
            ),
          ),
          const SizedBox(height: MzaziSpace.s12),
          SizedBox(
            height: MzaziA11y.elderMinTouchTarget,
            child: OutlinedButton(
              onPressed: _requesting ? null : _haveCode,
              child: const Text('I have a code from my caregiver'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _codeStep(BuildContext context) {
    final AuthController auth = context.watch<AuthController>();
    final String? error = auth.error ?? _requestError;

    return Form(
      key: _codeForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          StepHeading(
            step: 2,
            title: 'Enter the code',
            lead: _texted
                ? 'If $_phoneNumber belongs to an elder, a six-digit code is on its way by '
                      'text. A code from your caregiver works here too.'
                : 'Type the six-digit code your caregiver sees on your page in their app.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          if (error != null) ...<Widget>[
            Notice(message: error, isError: true),
            const SizedBox(height: MzaziSpace.s16),
          ],
          CodeField(controller: _code, onSubmitted: (_) => unawaited(_signIn())),
          const SizedBox(height: MzaziSpace.s24),
          SizedBox(
            height: MzaziA11y.elderMinTouchTarget,
            child: FilledButton(
              onPressed: auth.isBusy ? null : () => unawaited(_signIn()),
              child: Text(auth.isBusy ? 'Signing in' : 'Sign in'),
            ),
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextButton(
            onPressed: _cooldown > 0 || _requesting ? null : () => unawaited(_textCode()),
            child: Text(
              _cooldown > 0
                  ? 'Text a new code in $_cooldown s'
                  : _texted
                  ? 'Text a new code'
                  : 'Text me a code instead',
            ),
          ),
          TextButton(onPressed: _changeNumber, child: const Text('Use a different number')),
        ],
      ),
    );
  }
}
