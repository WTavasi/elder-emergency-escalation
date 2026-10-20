import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/section_label.dart';
import '../consent/consent_screen.dart';
import '../responder/widgets/call_button.dart';
import 'widgets/address_picker.dart';

/// One elder: where they are, their home, how much help they need, and who is asked,
/// in order, when they need it.
///
/// Everybody in the chain can see it and record that the elder is staying elsewhere or
/// is back home, because whoever knows should be able to say. Only a caregiver can move
/// the registered home, change the care level, or change the chain.
class ElderScreen extends StatefulWidget {
  const ElderScreen({required this.api, required this.elderId, required this.elderName, super.key});

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
      explanation: 'Alerts from them go to this place until you record that they are back home.',
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

  /// What has been agreed about this elder. A caregiver can withdraw it for them there;
  /// anybody else in the chain can read it. Reloaded afterwards, since a withdrawal
  /// changes what this page may show.
  Future<void> _openConsent() async {
    await Navigator.of(context).push(
      MaterialPageRoute<bool>(
        builder: (_) => ConsentScreen(
          api: widget.api,
          elderId: widget.elderId,
          audience: ConsentAudience.careCircle,
        ),
      ),
    );
    if (mounted) await _load();
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
      appBar: AppBar(),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, 0, MzaziSpace.s16, MzaziSpace.s32),
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(widget.elderName, style: theme.textTheme.headlineLarge),
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s16),
              Notice(message: _error!, isError: true),
            ],
            if (elder == null || chain == null)
              _error == null
                  ? const Padding(
                      padding: EdgeInsets.all(MzaziSpace.s32),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  : const SizedBox.shrink()
            else ...<Widget>[
              if (elder.phone case final String phone) ...<Widget>[
                Text(
                  phone,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontFamily: MzaziFont.mono,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: MzaziSpace.s16),
                SizedBox(
                  width: double.infinity,
                  child: CallButton(name: elder.name, phone: phone),
                ),
              ] else
                const _Fact(
                  'Their number is not shared, at their request. In an emergency it is shown '
                  'to whoever is helping.',
                ),
              const SizedBox(height: MzaziSpace.s32),
              const SectionLabel('Where they are now'),
              _Fact(
                elder.place.withheld
                    ? 'Not shared, at their request'
                    : elder.place.isAtHome
                    ? 'At home'
                    : 'Staying at ${elder.place.label ?? 'a recorded place'}',
              ),
              // Anybody in the chain may say where she is, so this is not behind canEdit.
              if (elder.place.withheld)
                const SizedBox.shrink()
              else if (elder.place.isAtHome)
                OutlinedButton.icon(
                  onPressed: _busy ? null : () => unawaited(_recordStay()),
                  icon: const Icon(Icons.luggage_outlined),
                  label: const Text('They are staying somewhere else'),
                )
              else
                OutlinedButton.icon(
                  onPressed: _busy
                      ? null
                      : () => unawaited(_act(() => widget.api.clearPlace(widget.elderId))),
                  icon: const Icon(Icons.home_outlined),
                  label: const Text('They are back home'),
                ),
              const SizedBox(height: MzaziSpace.s32),
              // The value first and the change beside the label, the way a settings page
              // on either platform puts an editable fact.
              SectionLabel(
                'Home',
                trailing: elder.canEdit && !elder.withheld.contains('location')
                    ? TextButton(
                        onPressed: _busy ? null : () => unawaited(_changeHome()),
                        child: const Text('Change their home'),
                      )
                    : null,
              ),
              _Fact(
                elder.withheld.contains('location')
                    ? 'Not shared, at their request'
                    : elder.home?.label ?? 'No home recorded',
              ),
              const SizedBox(height: MzaziSpace.s16),
              SectionLabel(
                'How much help they need',
                trailing: elder.canEdit
                    ? TextButton(
                        onPressed: _busy
                            ? null
                            : () => unawaited(_changeCareLevel(elder.careLevel)),
                        child: const Text('Change'),
                      )
                    : null,
              ),
              _Fact(elder.careLevel?.label ?? 'Not sure'),
              const SizedBox(height: MzaziSpace.s16),
              const SectionLabel('Who is asked, in order'),
              const SizedBox(height: MzaziSpace.s12),
              Text(
                'An emergency responder near the alert is asked last, chosen by area.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: MzaziSpace.s8),
              for (final ChainPlace place in chain.places) ...<Widget>[
                _ChainRow(
                  place: place,
                  label: _placeLabel(place),
                  onRemove: place.removable && !_busy ? () => unawaited(_remove(place)) : null,
                ),
                const Divider(),
              ],
              if (chain.canEdit) ...<Widget>[
                const SizedBox(height: MzaziSpace.s8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _busy ? null : () => unawaited(_addFamily()),
                    icon: const Icon(Icons.person_add_alt_1_outlined),
                    label: const Text('Add a family member'),
                  ),
                ),
              ],
              const SizedBox(height: MzaziSpace.s32),
              const SectionLabel('Privacy'),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _busy ? null : () => unawaited(_openConsent()),
                  icon: const Icon(Icons.privacy_tip_outlined),
                  label: const Text('Privacy and consent'),
                ),
              ),
            ],
          ],
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

/// One fact under a section label, at reading size.
class _Fact extends StatelessWidget {
  const _Fact(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s12),
    child: Text(text, style: Theme.of(context).textTheme.bodyLarge),
  );
}

/// One place in the chain: the rank as a large figure, then who, then what they are and
/// their number. The remove control, where there is one, is a full touch target.
class _ChainRow extends StatelessWidget {
  const _ChainRow({required this.place, required this.label, this.onRemove});

  final ChainPlace place;
  final String label;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: MzaziSpace.s32,
            child: Text(
              '${place.tier}',
              style: theme.textTheme.titleLarge?.copyWith(fontFamily: MzaziFont.mono),
              semanticsLabel: 'Tier ${place.tier}',
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(place.name, style: theme.textTheme.titleMedium),
                Text(label, style: theme.textTheme.bodySmall),
                Text(
                  place.phone,
                  style: theme.textTheme.bodySmall?.copyWith(fontFamily: MzaziFont.mono),
                ),
              ],
            ),
          ),
          if (place.removable)
            IconButton(
              onPressed: onRemove,
              icon: const Icon(Icons.person_remove_outlined),
              tooltip: place.isInvited ? 'Withdraw the invitation' : 'Remove ${place.name}',
            )
          else if (place.isInvited)
            Padding(
              padding: const EdgeInsets.all(MzaziSpace.s12),
              child: Icon(
                Icons.hourglass_top,
                color: theme.colorScheme.onSurfaceVariant,
                semanticLabel: 'Waiting for them to sign up',
              ),
            ),
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
