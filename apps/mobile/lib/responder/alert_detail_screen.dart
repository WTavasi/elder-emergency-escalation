import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../widgets/notice.dart';
import '../widgets/state_pill.dart';
import 'alert_detail_controller.dart';

/// One emergency, and the decision.
///
/// The order on the screen is the order of the decision: who and where, then the two
/// buttons, then what a person might want to check afterwards.
///
/// The severity reasoning is deliberately not here at all. It used to be, collapsed, and
/// that was still wrong: a caregiver is deciding whether to get in a car, not auditing
/// how a number was produced. The score's band is shown because it says who to attend to
/// first, and the arithmetic behind it belongs on the operations console.
class AlertDetailScreen extends StatefulWidget {
  const AlertDetailScreen({required this.fallback, super.key});

  /// The row the list already had. Shown immediately so the screen opens with content
  /// rather than a spinner over information the app is holding.
  final AlertSummary fallback;

  @override
  State<AlertDetailScreen> createState() => _AlertDetailScreenState();
}

class _AlertDetailScreenState extends State<AlertDetailScreen> {
  @override
  void initState() {
    super.initState();
    context.read<AlertDetailController>().start();
  }

  @override
  Widget build(BuildContext context) {
    final AlertDetailController controller = context.watch<AlertDetailController>();
    final AlertDetail? detail = controller.detail;
    final AlertSummary alert = detail?.summary ?? widget.fallback;
    final ThemeData theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(alert.elderName)),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: controller.refresh,
          child: ListView(
            padding: const EdgeInsets.all(MzaziSpace.s16),
            children: <Widget>[
              _Header(alert: alert),
              const SizedBox(height: MzaziSpace.s16),

              if (controller.actionError != null) ...<Widget>[
                Notice(message: controller.actionError!, isError: true),
                const SizedBox(height: MzaziSpace.s16),
              ],
              if (controller.confirmation != null) ...<Widget>[
                Notice(message: controller.confirmation!),
                const SizedBox(height: MzaziSpace.s16),
              ],

              _Actions(controller: controller, alert: alert),
              const SizedBox(height: MzaziSpace.s24),

              if (detail == null && controller.isLoading)
                const Center(child: CircularProgressIndicator())
              else if (detail != null) ...<Widget>[
                _WhatHappened(entries: detail.timeline, chain: detail.chain),
                const SizedBox(height: MzaziSpace.s24),
                _Chain(members: detail.chain, currentTier: alert.currentTier),
              ],

              if (controller.loadError != null) ...<Widget>[
                const SizedBox(height: MzaziSpace.s16),
                Text(
                  'Could not refresh: ${controller.loadError}',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.alert});

  final AlertSummary alert;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            StatePill(state: alert.state),
            const SizedBox(width: MzaziSpace.s8),
            Text(_severityWord(alert.severity), style: theme.textTheme.labelLarge),
          ],
        ),
        const SizedBox(height: MzaziSpace.s12),
        Text(
          'Raised ${elapsedSince(alert.triggeredAt)}, at tier ${alert.currentTier}.',
          style: theme.textTheme.bodyLarge,
        ),
        if (alert.addressLabel != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s4),
          Text(alert.addressLabel!, style: theme.textTheme.bodyMedium),
        ],
        if (alert.ownerName != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Text(
            '${alert.ownerName} is responding.',
            style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
        if (alert.outcome != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Text('Closed: ${_outcomeWord(alert.outcome!)}', style: theme.textTheme.bodyLarge),
          if (alert.outcomeNote != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s4),
            // What the person who closed it actually wrote. For an "other" outcome this is
            // the only record of what happened, so it is shown rather than filed away.
            Text('"${alert.outcomeNote}"', style: theme.textTheme.bodyMedium),
          ],
        ],
      ],
    );
  }

  static String _severityWord(Severity severity) => switch (severity) {
    Severity.standard => 'Standard severity',
    Severity.elevated => 'Elevated severity',
    Severity.critical => 'Critical severity',
  };

  /// The enum value made readable, without a lookup table that would go stale the moment
  /// an outcome is added on the server.
  static String _outcomeWord(String wire) {
    final String spaced = wire.toLowerCase().replaceAll('_', ' ');
    return spaced.isEmpty ? wire : '${spaced[0].toUpperCase()}${spaced.substring(1)}';
  }
}

/// The four things a person can do, filtered to the ones that make sense now.
///
/// Whether this particular account was asked at this tier is not shown in the
/// projection, so both buttons appear on any unanswered emergency and the server is left
/// to refuse. That is the right way round: the server already knows, and a button that
/// explains why it cannot be used is better than a screen that guesses and hides the
/// only action somebody needed.
class _Actions extends StatelessWidget {
  const _Actions({required this.controller, required this.alert});

  final AlertDetailController controller;
  final AlertSummary alert;

  @override
  Widget build(BuildContext context) {
    if (!alert.state.isOpen) {
      return Text(
        'This emergency is closed. Nothing more to do.',
        style: Theme.of(context).textTheme.bodyLarge,
      );
    }

    final bool busy = controller.isWorking;

    if (!alert.isAnswered) {
      return Column(
        children: <Widget>[
          SizedBox(
            width: double.infinity,
            height: MzaziA11y.standardMinTouchTarget,
            child: FilledButton(
              onPressed: busy ? null : controller.acknowledge,
              child: const Text('I am on my way'),
            ),
          ),
          const SizedBox(height: MzaziSpace.s12),
          SizedBox(
            width: double.infinity,
            height: MzaziA11y.standardMinTouchTarget,
            child: OutlinedButton(
              onPressed: busy ? null : () => _confirmDecline(context),
              child: const Text('I cannot come'),
            ),
          ),
        ],
      );
    }

    return Column(
      children: <Widget>[
        SizedBox(
          width: double.infinity,
          height: MzaziA11y.standardMinTouchTarget,
          child: FilledButton(
            onPressed: busy ? null : () => _chooseOutcome(context),
            child: const Text('Close this emergency'),
          ),
        ),
        const SizedBox(height: MzaziSpace.s12),
        SizedBox(
          width: double.infinity,
          height: MzaziA11y.standardMinTouchTarget,
          child: OutlinedButton(
            onPressed: busy ? null : controller.requestResponder,
            child: const Text('Call an emergency responder'),
          ),
        ),
      ],
    );
  }

  /// Declining sends the emergency onward immediately, so it is confirmed rather than
  /// fired from a single press. The reason is optional: asking for one is useful, and
  /// requiring one would slow down the exact moment nobody should be slowed down.
  Future<void> _confirmDecline(BuildContext context) async {
    final TextEditingController reason = TextEditingController();

    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text('Cannot come?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              'The emergency will stop waiting on you and move on to the next person '
              'straight away.',
            ),
            const SizedBox(height: MzaziSpace.s16),
            TextField(
              controller: reason,
              maxLength: 200,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Reason (optional)',
                hintText: 'At work, two hours away',
              ),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Never mind'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('I cannot come'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await controller.decline(reason: reason.text.trim());
    }
    reason.dispose();
  }

  /// Closing records how it ended, because an emergency with no outcome tells the report
  /// nothing about whether the system helped.
  Future<void> _chooseOutcome(BuildContext context) async {
    final _Closure? closure = await showModalBottomSheet<_Closure>(
      context: context,
      isScrollControlled: true,
      builder: (BuildContext _) => const _OutcomeSheet(),
    );

    if (closure != null) {
      await controller.resolve(closure.outcome, note: closure.note);
    }
  }
}

/// What came back from the sheet: the outcome, and the words if any were written.
class _Closure {
  const _Closure(this.outcome, this.note);

  final Outcome outcome;
  final String? note;
}

/// How it ended.
///
/// Two steps rather than one screen of controls. Step one is the question and its five
/// answers; step two only exists for "Something else", where the answer has to be written
/// rather than chosen. Putting a text field on the first step would have made every closure
/// look like it needed typing, and most do not.
class _OutcomeSheet extends StatefulWidget {
  const _OutcomeSheet();

  @override
  State<_OutcomeSheet> createState() => _OutcomeSheetState();
}

class _OutcomeSheetState extends State<_OutcomeSheet> {
  final TextEditingController _note = TextEditingController();
  bool _writing = false;
  bool _tooShort = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return SafeArea(
      child: Padding(
        // Lifts the sheet clear of the keyboard on the writing step.
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        // Scrollable, because five options plus the keyboard is taller than a short
        // phone in landscape, and a sheet that overflows loses the button at the bottom,
        // which is the only way out of it.
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  MzaziSpace.s16,
                  MzaziSpace.s24,
                  MzaziSpace.s16,
                  MzaziSpace.s8,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    // The question is bold and the answers are not, so the two are never
                    // mistaken for each other at a glance.
                    Text(
                      _writing ? 'What happened?' : 'How did it end?',
                      style: theme.textTheme.titleLarge,
                    ),
                    const SizedBox(height: MzaziSpace.s4),
                    Text(
                      _writing
                          ? 'A sentence is enough. It is kept with the emergency.'
                          : 'This is kept with the emergency and counted in the reporting.',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              if (_writing) _writingStep(theme) else _choosingStep(theme),
              const SizedBox(height: MzaziSpace.s8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _choosingStep(ThemeData theme) => Column(
    mainAxisSize: MainAxisSize.min,
    children: <Widget>[
      for (final Outcome outcome in Outcome.values)
        ListTile(
          title: Text(outcome.label, style: theme.textTheme.bodyLarge),
          subtitle: Text(outcome.hint, style: theme.textTheme.bodySmall),
          trailing: outcome.needsNote ? const Icon(Icons.chevron_right) : null,
          minTileHeight: MzaziA11y.standardMinTouchTarget,
          onTap: () {
            if (outcome.needsNote) {
              setState(() => _writing = true);
            } else {
              Navigator.of(context).pop(_Closure(outcome, null));
            }
          },
        ),
    ],
  );

  Widget _writingStep(ThemeData theme) => Padding(
    padding: const EdgeInsets.fromLTRB(
      MzaziSpace.s16,
      MzaziSpace.s8,
      MzaziSpace.s16,
      MzaziSpace.s16,
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        TextField(
          controller: _note,
          autofocus: true,
          maxLength: 300,
          maxLines: 3,
          minLines: 2,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            hintText: 'She had locked herself out and a neighbour let her in',
            errorText: _tooShort ? 'Say briefly what happened.' : null,
          ),
          onChanged: (String _) {
            if (_tooShort) setState(() => _tooShort = false);
          },
        ),
        const SizedBox(height: MzaziSpace.s8),
        Row(
          children: <Widget>[
            TextButton(
              onPressed: () => setState(() {
                _writing = false;
                _tooShort = false;
              }),
              child: const Text('Back'),
            ),
            const SizedBox(width: MzaziSpace.s12),
            // Expanded, not a Spacer and a fixed box. The theme gives every filled button
            // Size.fromHeight(48), which is infinitely wide by design so that buttons fill a
            // column. Inside a row nothing bounds that, and the button asked for infinite
            // width and failed on every frame. Expanded hands it the rest of the row, which
            // is also the better layout: the committing action is the large target.
            Expanded(
              child: FilledButton(
                // Checked here as well as on the server. An "something else" with nothing
                // written against it is a closed emergency nobody can account for later,
                // and the person is standing right here and can fix it in a second.
                onPressed: () {
                  final String text = _note.text.trim();
                  if (text.isEmpty) {
                    setState(() => _tooShort = true);
                    return;
                  }
                  Navigator.of(context).pop(_Closure(Outcome.other, text));
                },
                // Not 'Close this emergency', which is the label on the button that opened
                // this sheet. Two controls with one name is confusing to read and
                // ambiguous to point at.
                child: const Text('Save and close'),
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class _WhatHappened extends StatelessWidget {
  const _WhatHappened({required this.entries, required this.chain});

  final List<TimelineEntry> entries;
  final List<ChainMember> chain;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final List<TimelineEntry> shown = entries.where(_isWorthShowing).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('What has happened', style: theme.textTheme.titleMedium),
        const SizedBox(height: MzaziSpace.s12),
        if (shown.isEmpty)
          Text('Nothing recorded yet.', style: theme.textTheme.bodyMedium)
        else
          for (final TimelineEntry entry in shown)
            Padding(
              padding: const EdgeInsets.only(bottom: MzaziSpace.s12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(_sentence(entry), style: theme.textTheme.bodyLarge),
                  Text(_when(entry.secondsFromTrigger), style: theme.textTheme.bodySmall),
                ],
              ),
            ),
      ],
    );
  }

  /// Two actions describe the system talking to itself and tell the reader nothing they
  /// can act on. Scoring is the admin's business, and a failed delivery is already
  /// visible as the alert still waiting.
  static bool _isWorthShowing(TimelineEntry entry) =>
      entry.action != 'SEVERITY_EVALUATED' && entry.action != 'NOTIFICATION_FAILED';

  String _sentence(TimelineEntry entry) {
    final String who = entry.actorName ?? 'Somebody';

    return switch (entry.action) {
      'EVENT_CREATED' => '$who asked for help',
      'TIER_DISPATCHED' => _dispatched(entry),
      'ESCALATED' => _escalated(entry),
      'ACKNOWLEDGED' => '$who is on the way',
      'DECLINED' => '$who cannot come',
      'RESPONDER_REQUESTED' => '$who called for an emergency responder',
      'RESOLVED' => '$who closed it',
      'CANCELLED' => '$who withdrew it',
      'REOPENED' => '$who reopened it',
      // An action added on the server after this screen was written. Better a tidied
      // version of the real name than a blank line pretending nothing happened.
      _ => _titleCase(entry.action),
    };
  }

  /// Names the people if the chain says who sits at that tier, because "Sent to Mary
  /// Otieno" is worth more to a reader than "Sent to tier 1".
  String _dispatched(TimelineEntry entry) {
    final int? tier = entry.tier;
    if (tier == null) return 'Sent to the first people to ask';

    final List<String> names = chain
        .where((ChainMember m) => m.priorityOrder == tier)
        .map((ChainMember m) => m.name)
        .toList();

    if (names.isEmpty) {
      final int count = entry.recipients ?? 0;
      return count == 1 ? 'Sent to 1 person' : 'Sent to $count people';
    }
    if (names.length == 1) return 'Sent to ${names.first}';
    return 'Sent to ${names.take(names.length - 1).join(', ')} and ${names.last}';
  }

  String _escalated(TimelineEntry entry) {
    final int? to = entry.toTier;
    if (to == null) return 'Nobody answered, and there is nobody further to ask';

    final List<String> names = chain
        .where((ChainMember m) => m.priorityOrder == to)
        .map((ChainMember m) => m.name)
        .toList();

    return names.isEmpty
        ? 'Nobody answered in time, so it moved on'
        : 'Nobody answered in time, so it moved on to ${names.join(' and ')}';
  }

  /// Relative to the alert, in units a person reads without counting zeroes.
  static String _when(int seconds) {
    if (seconds <= 0) return 'when the alert was raised';
    if (seconds < 60) return '$seconds seconds after the alert';
    final int minutes = seconds ~/ 60;
    if (minutes < 60) return '$minutes ${minutes == 1 ? 'minute' : 'minutes'} after the alert';
    final int hours = minutes ~/ 60;
    return '$hours ${hours == 1 ? 'hour' : 'hours'} after the alert';
  }

  static String _titleCase(String action) {
    final String spaced = action.toLowerCase().replaceAll('_', ' ');
    return spaced.isEmpty ? action : '${spaced[0].toUpperCase()}${spaced.substring(1)}';
  }
}

class _Chain extends StatelessWidget {
  const _Chain({required this.members, required this.currentTier});

  final List<ChainMember> members;
  final int currentTier;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Who is being asked', style: theme.textTheme.titleMedium),
        const SizedBox(height: MzaziSpace.s12),
        if (members.isEmpty)
          Text('Nobody is configured for this elder.', style: theme.textTheme.bodyMedium)
        else
          for (final ChainMember member in members)
            Padding(
              padding: const EdgeInsets.only(bottom: MzaziSpace.s8),
              child: Row(
                children: <Widget>[
                  SizedBox(
                    width: 56,
                    child: Text('Tier ${member.priorityOrder}', style: theme.textTheme.bodySmall),
                  ),
                  Expanded(
                    child: Text(
                      member.name,
                      style: member.priorityOrder == currentTier
                          ? theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)
                          : theme.textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}
