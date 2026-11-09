import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/settings_list.dart';

/// Who is asked first when an elder presses help: each person in a group, and everybody
/// in a group asked at the same time. A neighbour who can be there in two minutes can be
/// asked with the caregiver rather than after them.
///
/// Nothing changes until Save, which sends the whole order at once. Emergency services
/// are not here: they are always asked last.
class ChainOrderScreen extends StatefulWidget {
  const ChainOrderScreen({required this.api, required this.chain, super.key});

  final ApiClient api;
  final ChainView chain;

  @override
  State<ChainOrderScreen> createState() => _ChainOrderScreenState();
}

class _ChainOrderScreenState extends State<ChainOrderScreen> {
  late final Map<String, int> _tiers = <String, int>{
    for (final ChainPlace place in _people) place.id: place.tier,
  };
  bool _busy = false;
  String? _error;

  List<ChainPlace> get _people =>
      widget.chain.places.where((ChainPlace place) => place.movable).toList();

  List<int> get _groups => widget.chain.personTiers;

  bool get _changed => _people.any((ChainPlace place) => _tiers[place.id] != place.tier);

  String _groupName(int tier) {
    final int index = _groups.indexOf(tier);
    return switch (index) {
      0 => 'Asked first',
      1 => 'Asked next',
      _ => 'Asked after that',
    };
  }

  String _moveLabel(int tier) => switch (_groups.indexOf(tier)) {
    0 => 'Ask first',
    1 => 'Ask next',
    _ => 'Ask after that',
  };

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ChainView updated = await widget.api.reorderChain(widget.chain.elderId, _tiers);
      if (mounted) Navigator.of(context).pop(updated);
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on NetworkException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final String first = widget.chain.elderName.split(' ').first;
    final double margin = MzaziLayout.margin(context);
    final String? error = _error;

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
          children: <Widget>[
            const PageTitle('Who is asked first'),
            Padding(
              padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s8, margin, 0),
              child: Text(
                'When $first presses help, everyone in a group is asked at the same time. '
                'If nobody answers, the next group is asked.',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ),
            for (final int tier in _groups)
              SettingsSection(
                title: _groupName(tier),
                footer: tier == _groups.last
                    ? 'After these, the emergency services near $first are asked.'
                    : null,
                children: <Widget>[
                  for (final ChainPlace place in _people.where(
                    (ChainPlace place) => _tiers[place.id] == tier,
                  ))
                    _PersonRow(
                      place: place,
                      moves: <(String, VoidCallback?)>[
                        for (final int other in _groups.where((int t) => t != tier))
                          (
                            _moveLabel(other),
                            _busy ? null : () => setState(() => _tiers[place.id] = other),
                          ),
                      ],
                    ),
                  if (!_people.any((ChainPlace place) => _tiers[place.id] == tier))
                    const SettingsDetail(title: 'Nobody'),
                ],
              ),
            if (error != null)
              Padding(
                padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s16, margin, 0),
                child: Notice(message: error, isError: true),
              ),
            Padding(
              padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s24, margin, 0),
              child: FilledButton(
                onPressed: _changed && !_busy ? _save : null,
                child: Text(_busy ? 'Saving…' : 'Save order'),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s8, margin, 0),
              child: Text(
                "We'll text $first and anyone you move.",
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.place, required this.moves});

  final ChainPlace place;
  final List<(String, VoidCallback?)> moves;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String who = switch (place.role) {
      Role.caregiver => 'Caregiver',
      Role.familyMember => 'Family',
      _ => place.isInvited ? 'Invited, not signed up yet' : '',
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: groupInset, vertical: MzaziSpace.s8),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(place.name, style: theme.textTheme.titleMedium),
                if (who.isNotEmpty) Text(who, style: theme.textTheme.bodySmall),
              ],
            ),
          ),
          for (final (String label, VoidCallback? onPressed) in moves)
            Padding(
              padding: const EdgeInsets.only(left: MzaziSpace.s8),
              child: TextButton(
                onPressed: onPressed,
                child: Text(label, semanticsLabel: '$label: ${place.name}'),
              ),
            ),
        ],
      ),
    );
  }
}
