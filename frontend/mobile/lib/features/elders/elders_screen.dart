import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/widgets/notice.dart';
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
    final ThemeData theme = Theme.of(context);
    final List<ElderSummary>? elders = _elders;

    return Scaffold(
      appBar: AppBar(title: const Text('People I look after')),
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
              if (elders == null && _error == null)
                const Padding(
                  padding: EdgeInsets.all(MzaziSpace.s24),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (elders != null && elders.isEmpty)
                _Empty(isCaregiver: widget.isCaregiver)
              else if (elders != null)
                for (final ElderSummary elder in elders)
                  Padding(
                    padding: const EdgeInsets.only(bottom: MzaziSpace.s12),
                    child: Card(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: MzaziSpace.s16,
                          vertical: MzaziSpace.s8,
                        ),
                        leading: CircleAvatar(child: Text(_initials(elder.name))),
                        title: Text(elder.name, style: theme.textTheme.titleMedium),
                        subtitle: Text(
                          <String>[
                            if (elder.homeLabel != null) elder.homeLabel!,
                            'You are asked at tier ${elder.myTier}',
                          ].join('\n'),
                          style: theme.textTheme.bodySmall,
                        ),
                        isThreeLine: elder.homeLabel != null,
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => unawaited(_open(elder)),
                      ),
                    ),
                  ),
              if (widget.isCaregiver) ...<Widget>[
                const SizedBox(height: MzaziSpace.s16),
                FilledButton.icon(
                  onPressed: () => unawaited(_add()),
                  icon: const Icon(Icons.person_add_alt_1_outlined),
                  label: const Text('Register somebody I look after'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _initials(String name) {
    final List<String> parts = name.trim().split(RegExp(r'\s+'));
    final String first = parts.first.isEmpty ? '?' : parts.first[0];
    final String last = parts.length > 1 ? parts.last[0] : '';
    return (first + last).toUpperCase();
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.isCaregiver});

  final bool isCaregiver;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s24),
      child: Column(
        children: <Widget>[
          Icon(Icons.groups_outlined, size: 40, color: theme.textTheme.bodySmall?.color),
          const SizedBox(height: MzaziSpace.s12),
          Text('Nobody yet', style: theme.textTheme.titleLarge),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            isCaregiver
                ? 'Register the person you look after. You will be first to be asked when they need help.'
                : 'A caregiver adds you to the person you are family to. Once they have, that person appears here.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }
}
