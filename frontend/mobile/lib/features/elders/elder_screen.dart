import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/notice.dart';
import '../responder/widgets/call_button.dart';
import 'widgets/address_picker.dart';

/// One elder: where they are, their home, how much help they need, and who is asked,
/// in order, when they need it.
///
/// Everybody in the chain can see it and record that the elder is staying elsewhere or
/// is back home, because whoever knows should be able to say. Only a caregiver can move
/// the registered home, change the care level, or change the chain.
class ElderScreen extends StatefulWidget {
  const ElderScreen({
    required this.api,
    required this.elderId,
    required this.elderName,
    super.key,
  });

  final ApiClient api;
  final String elderId;
  final String elderName;

  @override
  State<ElderScreen> createState() => _ElderScreenState();
}

class _ElderScreenState extends State<ElderScreen> {
  ElderDetail? _elder;
  ChainView? _chain;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final ElderDetail elder = await widget.api.elder(widget.elderId);
      final ChainView chain = await widget.api.chain(widget.elderId);
      if (!mounted) return;
      setState(() {
        _elder = elder;
        _chain = chain;
        _error = null;
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    }
  }

  /// Runs one change, shows its error if it fails, and reloads either way.
  Future<void> _act(Future<void> Function() change) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await change();
    } on Exception catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
    if (!mounted) return;
    setState(() => _busy = false);
    await _load();
  }

  Future<AddressMatch?> _pickPlace({
    required String title,
    required String explanation,
    required String prefix,
    required String action,
  }) => showModalBottomSheet<AddressMatch>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _PlaceSheet(
      api: widget.api,
      title: title,
      explanation: explanation,
      prefix: prefix,
      action: action,
    ),
  );

  Future<void> _recordStay() async {
    final AddressMatch? place = await _pickPlace(
      title: 'Where are they staying?',
      explanation:
          'Alerts from them go to this place until you record that they are back home.',
      prefix: 'Staying at',
      action: 'Record this stay',
    );
    if (place != null) await _act(() => widget.api.setPlace(widget.elderId, place));
  }

  Future<void> _changeHome() async {
    final AddressMatch? home = await _pickPlace(
      title: 'Where is their home?',
      explanation:
          'Alerts from them are sent here whenever no stay elsewhere is recorded, and the '
          'away-from-home part of their severity is measured from here.',
      prefix: 'Home',
      action: 'Save as their home',
    );
    if (home != null) {
      await _act(() async => widget.api.updateElder(widget.elderId, home: home));
    }
  }

  Future<void> _changeCareLevel(CareLevel? current) async {
    final _LevelChoice? choice = await showDialog<_LevelChoice>(
      context: context,
      builder: (_) => _CareLevelDialog(current: current),
    );
    if (choice == null) return;
    await _act(
      () async => widget.api.updateElder(
        widget.elderId,
        careLevel: choice.level,
        clearCareLevel: choice.level == null,
      ),
    );
  }

  Future<void> _remove(ChainPlace place) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(place.isInvited ? 'Withdraw the invitation?' : 'Remove ${place.name}?'),
        content: Text(
          place.isInvited
              ? 'The place held for ${place.phone} is released. Nothing is sent to them.'
              : '${place.name} will no longer be asked when ${widget.elderName} needs help. '
                    'They will get an SMS saying so.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep them'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(place.isInvited ? 'Withdraw' : 'Remove'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _act(() async => widget.api.removeFromChain(widget.elderId, place.id));
    }
  }

  Future<void> _addFamily() async {
    final ChainView? updated = await showModalBottomSheet<ChainView>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _AddFamilySheet(api: widget.api, elderId: widget.elderId),
    );
    if (updated != null && mounted) setState(() => _chain = updated);
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ElderDetail? elder = _elder;
    final ChainView? chain = _chain;

    return Scaffold(
      appBar: AppBar(title: Text(widget.elderName)),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(MzaziSpace.s16),
            children: <Widget>[
              if (_error != null) ...<Widget>[
                Notice(message: _error!, isError: true),
                const SizedBox(height: MzaziSpace.s16),
              ],
              if (elder == null || chain == null)
                _error == null
                    ? const Center(child: CircularProgressIndicator())
                    : const SizedBox.shrink()
              else ...<Widget>[
                SizedBox(
                  width: double.infinity,
                  child: CallButton(name: elder.name, phone: elder.phone),
                ),
                const SizedBox(height: MzaziSpace.s24),
                _Section(
                  title: 'Where they are now',
                  icon: elder.place.isAtHome ? Icons.home_outlined : Icons.luggage_outlined,
                  body: elder.place.isAtHome
                      ? 'At home'
                      : 'Staying at ${elder.place.label ?? 'a recorded place'}',
                  action: elder.place.isAtHome
                      ? OutlinedButton.icon(
                          onPressed: _busy ? null : () => unawaited(_recordStay()),
                          icon: const Icon(Icons.luggage_outlined),
                          label: const Text('They are staying somewhere else'),
                        )
                      : OutlinedButton.icon(
                          onPressed: _busy
                              ? null
                              : () => unawaited(
                                  _act(() => widget.api.clearPlace(widget.elderId)),
                                ),
                          icon: const Icon(Icons.home_outlined),
                          label: const Text('They are back home'),
                        ),
                ),
                _Section(
                  title: 'Home',
                  icon: Icons.place_outlined,
                  body: elder.home?.label ?? 'No home recorded',
                  action: elder.canEdit
                      ? OutlinedButton.icon(
                          onPressed: _busy ? null : () => unawaited(_changeHome()),
                          icon: const Icon(Icons.edit_location_alt_outlined),
                          label: const Text('Change their home'),
                        )
                      : null,
                ),
                _Section(
                  title: 'How much help they need',
                  icon: Icons.accessibility_new,
                  body: elder.careLevel?.label ?? 'Not sure',
                  action: elder.canEdit
                      ? OutlinedButton.icon(
                          onPressed: _busy
                              ? null
                              : () => unawaited(_changeCareLevel(elder.careLevel)),
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Change'),
                        )
                      : null,
                ),
                const SizedBox(height: MzaziSpace.s8),
                Text('Who is asked, in order', style: theme.textTheme.titleLarge),
                const SizedBox(height: MzaziSpace.s8),
                Text(
                  'When ${widget.elderName} asks for help, the first person is asked. If nobody '
                  'answers in time, the next is asked. An emergency responder near the alert '
                  'comes last, chosen by area.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: MzaziSpace.s16),
                for (final ChainPlace place in chain.places)
                  Card(
                    margin: const EdgeInsets.only(bottom: MzaziSpace.s12),
                    child: ListTile(
                      leading: CircleAvatar(child: Text('${place.tier}')),
                      title: Text(place.name, style: theme.textTheme.titleMedium),
                      subtitle: Text(
                        '${_placeLabel(place)}\n${place.phone}',
                        style: theme.textTheme.bodySmall,
                      ),
                      isThreeLine: true,
                      trailing: place.removable
                          ? IconButton(
                              onPressed: _busy ? null : () => unawaited(_remove(place)),
                              icon: const Icon(Icons.person_remove_outlined),
                              tooltip: place.isInvited
                                  ? 'Withdraw the invitation'
                                  : 'Remove ${place.name}',
                            )
                          : place.isInvited
                          ? const Tooltip(
                              message: 'Waiting for them to sign up',
                              child: Icon(Icons.hourglass_top),
                            )
                          : null,
                    ),
                  ),
                if (chain.canEdit) ...<Widget>[
                  const SizedBox(height: MzaziSpace.s8),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => unawaited(_addFamily()),
                    icon: const Icon(Icons.person_add_alt_1_outlined),
                    label: const Text('Add a family member'),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _placeLabel(ChainPlace place) {
    if (place.isInvited) return 'Invited. Their place is held until they sign up.';
    return switch (place.role) {
      Role.caregiver => 'Caregiver',
      Role.familyMember => 'Family',
      Role.emergencyResponder => 'Emergency responder',
      _ => '',
    };
  }
}

/// A heading, one line saying how things are, and the action that changes it.
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.icon, required this.body, this.action});

  final String title;
  final IconData icon;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: MzaziSpace.s24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(title, style: theme.textTheme.titleMedium),
          const SizedBox(height: MzaziSpace.s8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(icon, size: 20, color: theme.textTheme.bodyLarge?.color),
              const SizedBox(width: MzaziSpace.s8),
              Expanded(child: Text(body, style: theme.textTheme.bodyLarge)),
            ],
          ),
          if (action != null) ...<Widget>[const SizedBox(height: MzaziSpace.s12), action!],
        ],
      ),
    );
  }
}

/// The answer from the care level dialog. A wrapper, because "not sure" is a null level
/// and a dialog that returns null has been dismissed.
class _LevelChoice {
  const _LevelChoice(this.level);

  final CareLevel? level;
}

class _CareLevelDialog extends StatefulWidget {
  const _CareLevelDialog({required this.current});

  final CareLevel? current;

  @override
  State<_CareLevelDialog> createState() => _CareLevelDialogState();
}

class _CareLevelDialogState extends State<_CareLevelDialog> {
  late CareLevel? _level = widget.current;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('How much help do they need?'),
      content: RadioGroup<CareLevel?>(
        groupValue: _level,
        onChanged: (CareLevel? value) => setState(() => _level = value),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(_LevelChoice(_level)),
          child: const Text('Save'),
        ),
      ],
    );
  }
}

/// A place chosen by address search, for a home or a stay.
class _PlaceSheet extends StatefulWidget {
  const _PlaceSheet({
    required this.api,
    required this.title,
    required this.explanation,
    required this.prefix,
    required this.action,
  });

  final ApiClient api;
  final String title;
  final String explanation;
  final String prefix;
  final String action;

  @override
  State<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<_PlaceSheet> {
  AddressMatch? _chosen;
  bool _showMissing = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        MzaziSpace.s24,
        MzaziSpace.s24,
        MzaziSpace.s24,
        MzaziSpace.s24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            AddressPicker(
              api: widget.api,
              chosen: _chosen,
              showMissing: _showMissing,
              onChosen: (AddressMatch match) => setState(() => _chosen = match),
              title: widget.title,
              explanation: widget.explanation,
              chosenPrefix: widget.prefix,
            ),
            const SizedBox(height: MzaziSpace.s24),
            FilledButton.icon(
              onPressed: () {
                if (_chosen == null) {
                  setState(() => _showMissing = true);
                  return;
                }
                Navigator.of(context).pop(_chosen);
              },
              icon: const Icon(Icons.check),
              label: Text(widget.action),
            ),
          ],
        ),
      ),
    );
  }
}

/// A name and a phone number. With an account, they join now; without one, their place
/// waits for them, and either way they are sent an SMS saying who added them.
class _AddFamilySheet extends StatefulWidget {
  const _AddFamilySheet({required this.api, required this.elderId});

  final ApiClient api;
  final String elderId;

  @override
  State<_AddFamilySheet> createState() => _AddFamilySheetState();
}

class _AddFamilySheetState extends State<_AddFamilySheet> {
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final PhoneFieldController _phone = PhoneFieldController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ChainView updated = await widget.api.addToChain(
        widget.elderId,
        phone: _phone.reading.e164!,
        name: _name.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(updated);
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
    final ThemeData theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        MzaziSpace.s24,
        MzaziSpace.s24,
        MzaziSpace.s24,
        MzaziSpace.s24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Add a family member', style: theme.textTheme.titleLarge),
            const SizedBox(height: MzaziSpace.s8),
            Text(
              'They are asked if the caregiver does not answer. They will get an SMS saying '
              'you added them.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: MzaziSpace.s16),
            if (_error != null) ...<Widget>[
              Notice(message: _error!, isError: true),
              const SizedBox(height: MzaziSpace.s16),
            ],
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Their name'),
              validator: (String? value) =>
                  (value == null || value.trim().length < 2) ? 'Enter their name.' : null,
            ),
            const SizedBox(height: MzaziSpace.s16),
            PhoneField(
              controller: _phone,
              label: 'Their phone number',
              textInputAction: TextInputAction.done,
            ),
            const SizedBox(height: MzaziSpace.s24),
            FilledButton.icon(
              onPressed: _busy ? null : () => unawaited(_submit()),
              icon: const Icon(Icons.person_add_alt_1_outlined),
              label: Text(_busy ? 'Adding' : 'Add them'),
            ),
          ],
        ),
      ),
    );
  }
}
