import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/notice.dart';
import '../auth/sign_up_screen.dart' show resendSeconds;

/// A caregiver registering the elder they look after.
///
/// The same two steps as signing up: details, then a code sent to the elder's own
/// phone, which the caregiver reads off it. That proves the number is the elder's,
/// and the caregiver becomes first in the elder's chain.
class AddElderScreen extends StatefulWidget {
  const AddElderScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<AddElderScreen> createState() => _AddElderScreenState();
}

class _AddElderScreenState extends State<AddElderScreen> {
  final GlobalKey<FormState> _details = GlobalKey<FormState>();
  final GlobalKey<FormState> _codeForm = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final PhoneFieldController _phone = PhoneFieldController();
  final TextEditingController _relationship = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirm = TextEditingController();
  final TextEditingController _code = TextEditingController();

  CareLevel? _careLevel;
  AddressMatch? _home;
  bool _consent = false;
  bool _showChecks = false;

  String? _sentTo;
  String? _error;
  bool _busy = false;
  int _cooldown = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    for (final TextEditingController c in <TextEditingController>[
      _name,
      _relationship,
      _password,
      _confirm,
      _code,
    ]) {
      c.dispose();
    }
    _phone.dispose();
    super.dispose();
  }

  String get _firstName {
    final String name = _name.text.trim();
    return name.isEmpty ? 'them' : name.split(RegExp(r'\s+')).first;
  }

  Future<void> _sendCode() async {
    final bool valid = _details.currentState?.validate() ?? false;
    setState(() => _showChecks = true);
    if (!valid || _home == null || !_consent) return;

    final String phone = _phone.reading.e164!;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.requestCode(phone);
      if (!mounted) return;
      setState(() {
        _sentTo = phone;
        _busy = false;
      });
      _startCooldown();
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.toString();
      });
    }
  }

  void _startCooldown() {
    _timer?.cancel();
    setState(() => _cooldown = resendSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (Timer timer) {
      if (!mounted) return timer.cancel();
      setState(() => _cooldown = _cooldown > 0 ? _cooldown - 1 : 0);
      if (_cooldown == 0) timer.cancel();
    });
  }

  Future<void> _register() async {
    if (!(_codeForm.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ElderSummary elder = await widget.api.createElder(
        name: _name.text.trim(),
        phone: _sentTo!,
        code: _code.text.trim(),
        password: _password.text,
        home: _home!,
        relationship: _relationship.text.trim(),
        careLevel: _careLevel,
      );
      if (mounted) Navigator.of(context).pop(elder);
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Register somebody')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(MzaziSpace.s24),
          child: _sentTo == null ? _detailsStep(context) : _codeStep(context),
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
          Text(
            'Their account is for asking for help. They sign in with their own phone number and '
            'the password you choose here, so pick one you can tell them.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: MzaziSpace.s24),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Their name'),
            onChanged: (_) => setState(() {}),
            validator: (String? v) =>
                (v == null || v.trim().length < 2) ? 'Enter their name.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          PhoneField(controller: _phone, label: 'Their phone number'),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _relationship,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'How you are related to them',
              helperText: 'For example: daughter, son, nurse',
            ),
            validator: (String? v) =>
                (v == null || v.trim().length < 2) ? 'Say how you are related.' : null,
          ),
          const SizedBox(height: MzaziSpace.s24),
          Text('How much help do they need day to day?', style: theme.textTheme.titleMedium),
          const SizedBox(height: MzaziSpace.s4),
          Text(
            'This helps decide how urgent an alert from them is.',
            style: theme.textTheme.bodySmall,
          ),
          RadioGroup<CareLevel?>(
            groupValue: _careLevel,
            onChanged: (CareLevel? value) => setState(() => _careLevel = value),
            child: Column(
              children: <Widget>[
                for (final CareLevel level in CareLevel.values)
                  RadioListTile<CareLevel?>(
                    contentPadding: EdgeInsets.zero,
                    value: level,
                    title: Text(level.label),
                  ),
                const RadioListTile<CareLevel?>(
                  contentPadding: EdgeInsets.zero,
                  value: null,
                  title: Text('Not sure'),
                ),
              ],
            ),
          ),
          const SizedBox(height: MzaziSpace.s16),
          _HomePicker(
            api: widget.api,
            chosen: _home,
            showMissing: _showChecks && _home == null,
            onChosen: (AddressMatch match) => setState(() => _home = match),
          ),
          const SizedBox(height: MzaziSpace.s24),
          TextFormField(
            controller: _password,
            obscureText: true,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'A password for them',
              helperText: 'At least 8 characters',
            ),
            validator: (String? v) =>
                (v == null || v.length < 8) ? 'Use at least 8 characters.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _confirm,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'The same password again'),
            validator: (String? v) =>
                v == _password.text ? null : 'The two passwords are different.',
          ),
          const SizedBox(height: MzaziSpace.s16),
          CheckboxListTile(
            value: _consent,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(
              '$_firstName agrees, or I may agree for them, to MzaziCare keeping these details '
              'and sharing their home with the people asked to help them.',
            ),
            subtitle: _showChecks && !_consent
                ? Text(
                    'This has to be agreed before they can be registered.',
                    style: TextStyle(color: theme.colorScheme.error),
                  )
                : null,
            onChanged: (bool? value) => setState(() => _consent = value ?? false),
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s16),
            Notice(message: _error!, isError: true),
          ],
          const SizedBox(height: MzaziSpace.s24),
          FilledButton.icon(
            onPressed: _busy ? null : () => unawaited(_sendCode()),
            icon: const Icon(Icons.sms_outlined),
            label: Text(_busy ? 'Sending' : 'Send a code to their phone'),
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
          Text('Enter the code from their phone', style: theme.textTheme.headlineSmall),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            'A six-digit code is on its way to $_sentTo by SMS, if it is not already registered. '
            'It works for 10 minutes.',
            style: theme.textTheme.bodyLarge,
          ),
          const SizedBox(height: MzaziSpace.s24),
          if (_error != null) ...<Widget>[
            Notice(message: _error!, isError: true),
            const SizedBox(height: MzaziSpace.s16),
          ],
          TextFormField(
            controller: _code,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: <TextInputFormatter>[
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            style: theme.textTheme.headlineSmall?.copyWith(
              fontFamily: MzaziFont.mono,
              letterSpacing: 8,
            ),
            decoration: const InputDecoration(labelText: 'Six-digit code'),
            onFieldSubmitted: (_) => unawaited(_register()),
            validator: (String? v) => (v?.length ?? 0) == 6 ? null : 'The code has six digits.',
          ),
          const SizedBox(height: MzaziSpace.s24),
          FilledButton.icon(
            onPressed: _busy ? null : () => unawaited(_register()),
            icon: const Icon(Icons.check),
            label: Text(_busy ? 'Registering' : 'Register $_firstName'),
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextButton(
            onPressed: _cooldown > 0 || _busy ? null : () => unawaited(_sendCode()),
            child: Text(_cooldown > 0 ? 'Send a new code in $_cooldown s' : 'Send a new code'),
          ),
          TextButton(
            onPressed: () => setState(() {
              _sentTo = null;
              _code.clear();
              _error = null;
            }),
            child: const Text('Change their details'),
          ),
        ],
      ),
    );
  }
}

/// Searching for the elder's home and choosing one of the matches.
///
/// Searched when Search is pressed, never as the person types: the address search
/// behind it is OpenStreetMap's public service, whose usage policy forbids
/// search-as-you-type. The attribution its licence asks for is shown under the results.
class _HomePicker extends StatefulWidget {
  const _HomePicker({
    required this.api,
    required this.chosen,
    required this.showMissing,
    required this.onChosen,
  });

  final ApiClient api;
  final AddressMatch? chosen;
  final bool showMissing;
  final ValueChanged<AddressMatch> onChosen;

  @override
  State<_HomePicker> createState() => _HomePickerState();
}

class _HomePickerState extends State<_HomePicker> {
  final TextEditingController _query = TextEditingController();
  AddressSearchResult? _result;
  String? _error;
  bool _searching = false;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    if (_query.text.trim().length < 3) {
      setState(() => _error = 'Type at least three letters of the address.');
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final AddressSearchResult result = await widget.api.searchAddress(_query.text);
      if (!mounted) return;
      setState(() {
        _result = result;
        _searching = false;
        if (result.matches.isEmpty) {
          _error = 'Nothing found. Try the estate or road, then the town.';
        }
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AddressSearchResult? result = _result;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Where is their home?', style: theme.textTheme.titleMedium),
        const SizedBox(height: MzaziSpace.s4),
        Text(
          'Alerts from them are sent to this place, and responders get directions to it.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: MzaziSpace.s12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Expanded(
              child: TextField(
                controller: _query,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  labelText: 'Estate, road or building',
                  helperText: 'For example: Kileleshwa, Nairobi',
                ),
                onSubmitted: (_) => unawaited(_search()),
              ),
            ),
            const SizedBox(width: MzaziSpace.s8),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 56)),
              onPressed: _searching ? null : () => unawaited(_search()),
              icon: const Icon(Icons.search),
              label: const Text('Search'),
            ),
          ],
        ),
        if (_error != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
        ],
        if (widget.showMissing && widget.chosen == null && _error == null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Text(
            'Search for their home and choose it from the list.',
            style: TextStyle(color: theme.colorScheme.error),
          ),
        ],
        if (result != null && result.matches.isNotEmpty) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          RadioGroup<AddressMatch>(
            groupValue: widget.chosen,
            onChanged: (AddressMatch? match) {
              if (match != null) widget.onChosen(match);
            },
            child: Column(
              children: <Widget>[
                for (final AddressMatch match in result.matches)
                  RadioListTile<AddressMatch>(
                    contentPadding: EdgeInsets.zero,
                    value: match,
                    title: Text(match.label, style: theme.textTheme.bodyMedium),
                  ),
              ],
            ),
          ),
          Text(result.attribution, style: theme.textTheme.bodySmall),
        ],
        if (widget.chosen != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Row(
            children: <Widget>[
              const Icon(Icons.home_outlined),
              const SizedBox(width: MzaziSpace.s8),
              Expanded(
                child: Text(
                  'Home: ${widget.chosen!.label}',
                  style: theme.textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
