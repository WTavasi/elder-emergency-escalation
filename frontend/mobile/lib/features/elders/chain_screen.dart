import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/phone/phone_field.dart';
import '../../core/widgets/notice.dart';

/// Who is asked, in order, when this elder needs help, and adding family to it.
class ChainScreen extends StatefulWidget {
  const ChainScreen({
    required this.api,
    required this.elderId,
    required this.elderName,
    super.key,
  });

  final ApiClient api;
  final String elderId;
  final String elderName;

  @override
  State<ChainScreen> createState() => _ChainScreenState();
}

class _ChainScreenState extends State<ChainScreen> {
  ChainView? _chain;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final ChainView chain = await widget.api.chain(widget.elderId);
      if (!mounted) return;
      setState(() {
        _chain = chain;
        _error = null;
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    }
  }

  Future<void> _add() async {
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
    final ChainView? chain = _chain;

    return Scaffold(
      appBar: AppBar(title: Text(widget.elderName)),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(MzaziSpace.s16),
            children: <Widget>[
              Text('Who is asked, in order', style: theme.textTheme.titleLarge),
              const SizedBox(height: MzaziSpace.s8),
              Text(
                'When ${widget.elderName} asks for help, the first person is asked. If nobody '
                'answers in time, the next is asked. An emergency responder near the alert '
                'comes last, chosen by area.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: MzaziSpace.s16),
              if (_error != null) ...<Widget>[
                Notice(message: _error!, isError: true),
                const SizedBox(height: MzaziSpace.s16),
              ],
              if (chain == null && _error == null)
                const Center(child: CircularProgressIndicator())
              else if (chain != null)
                for (final ChainPlace place in chain.places)
                  Card(
                    margin: const EdgeInsets.only(bottom: MzaziSpace.s12),
                    child: ListTile(
                      leading: CircleAvatar(child: Text('${place.tier}')),
                      title: Text(place.name, style: theme.textTheme.titleMedium),
                      subtitle: Text(
                        '${_describe(place)}\n${place.phone}',
                        style: theme.textTheme.bodySmall,
                      ),
                      isThreeLine: true,
                      trailing: place.isInvited
                          ? const Tooltip(
                              message: 'Waiting for them to sign up',
                              child: Icon(Icons.hourglass_top),
                            )
                          : null,
                    ),
                  ),
              if (chain != null && chain.canEdit) ...<Widget>[
                const SizedBox(height: MzaziSpace.s8),
                OutlinedButton.icon(
                  onPressed: () => unawaited(_add()),
                  icon: const Icon(Icons.person_add_alt_1_outlined),
                  label: const Text('Add a family member'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _describe(ChainPlace place) {
    if (place.isInvited) return 'Invited. Their place is held until they sign up.';
    return switch (place.role) {
      Role.caregiver => 'Caregiver',
      Role.familyMember => 'Family',
      Role.emergencyResponder => 'Emergency responder',
      _ => '',
    };
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
