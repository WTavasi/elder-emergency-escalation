import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import 'add_elder_screen.dart';
import 'elder_screen.dart';

/// The elders the signed-in person looks after, and for a caregiver, adding one.
///
/// Reached from the alert list. A caregiver who has just signed up lands here with an
/// empty list and one obvious thing to do.
class EldersScreen extends StatefulWidget {
  const EldersScreen({required this.api, required this.isCaregiver, super.key});

  final ApiClient api;

  /// Only a caregiver can register an elder, so only a caregiver is offered it.
  final bool isCaregiver;

  @override
  State<EldersScreen> createState() => _EldersScreenState();
}

class _EldersScreenState extends State<EldersScreen> {
  List<ElderSummary>? _elders;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final List<ElderSummary> elders = await widget.api.myElders();
      if (!mounted) return;
      setState(() {
        _elders = elders;
        _error = null;
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    }
  }

  Future<void> _add() async {
    final ElderSummary? added = await Navigator.of(context).push<ElderSummary>(
      MaterialPageRoute<ElderSummary>(builder: (_) => AddElderScreen(api: widget.api)),
    );
    if (added != null) await _load();
  }

  Future<void> _open(ElderSummary elder) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => ElderScreen(api: widget.api, elderId: elder.id, elderName: elder.name),
      ),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final List<ElderSummary>? elders = _elders;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: MzaziSpace.s24),
            children: <Widget>[
              PageTitle(
                'People',
                subtitle: widget.isCaregiver
                    ? 'The people you look after'
                    : 'The people you are family to',
              ),
              const Divider(),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.all(MzaziSpace.s16),
                  child: Notice(message: _error!, isError: true),
                ),
              if (elders == null && _error == null)
                const Padding(
                  padding: EdgeInsets.all(MzaziSpace.s32),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (elders != null && elders.isEmpty)
                _Empty(isCaregiver: widget.isCaregiver)
              else if (elders != null)
                for (final ElderSummary elder in elders) ...<Widget>[
                  _ElderRow(elder: elder, onOpen: () => unawaited(_open(elder))),
                  const Divider(indent: MzaziSpace.s16),
                ],
              if (widget.isCaregiver)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    MzaziSpace.s16,
                    MzaziSpace.s24,
                    MzaziSpace.s16,
                    0,
                  ),
                  child: FilledButton.icon(
                    onPressed: () => unawaited(_add()),
                    icon: const Icon(Icons.person_add_alt_1_outlined),
                    label: const Text('Register somebody I look after'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One person: name and home on the left, the rank you are asked at on the right, set
/// as a figure so the column of them can be read down the list.
class _ElderRow extends StatelessWidget {
  const _ElderRow({required this.elder, required this.onOpen});

  final ElderSummary elder;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return InkWell(
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          MzaziSpace.s16,
          MzaziSpace.s16,
          MzaziSpace.s8,
          MzaziSpace.s16,
        ),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(elder.name, style: theme.textTheme.titleMedium),
                  if (elder.homeLabel != null)
                    Text(elder.homeLabel!, style: theme.textTheme.bodySmall),
                ],
              ),
            ),
            const SizedBox(width: MzaziSpace.s12),
            Semantics(
              label: 'You are asked at tier ${elder.myTier}',
              excludeSemantics: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  Text('TIER', style: theme.textTheme.labelSmall),
                  Text(
                    '${elder.myTier}',
                    style: theme.textTheme.titleLarge?.copyWith(fontFamily: MzaziFont.mono),
                  ),
                ],
              ),
            ),
            const SizedBox(width: MzaziSpace.s4),
            Icon(Icons.chevron_right, color: theme.colorScheme.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.isCaregiver});

  final bool isCaregiver;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, MzaziSpace.s24, MzaziSpace.s16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Nobody yet', style: theme.textTheme.titleLarge),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            isCaregiver
                ? 'Register the person you look after. You will be first to be asked when they '
                      'need help.'
                : 'A caregiver adds you to the person you are family to. Once they have, that '
                      'person appears here.',
            style: theme.textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }
}
