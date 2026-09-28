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
/// buttons, then everything a person might want to check afterwards. The severity
/// reasoning sits below the fold and closed, for the same reason it is collapsed on the
/// console: it explains a number nobody is arguing with while somebody is waiting.
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
                _Timeline(entries: detail.timeline),
                const SizedBox(height: MzaziSpace.s24),
                _Chain(members: detail.chain, currentTier: alert.currentTier),
                const SizedBox(height: MzaziSpace.s24),
                _SeverityReasoning(factors: detail.factors, score: alert.severityScore),
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
    final Outcome? chosen = await showModalBottomSheet<Outcome>(
      context: context,
      builder: (BuildContext sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.all(MzaziSpace.s16),
              child: Text('How did it end?', style: Theme.of(sheetContext).textTheme.titleMedium),
            ),
            for (final Outcome outcome in Outcome.values)
              ListTile(
                title: Text(outcome.label),
                minTileHeight: MzaziA11y.standardMinTouchTarget,
                onTap: () => Navigator.of(sheetContext).pop(outcome),
              ),
            const SizedBox(height: MzaziSpace.s8),
          ],
        ),
      ),
    );

    if (chosen != null) await controller.resolve(chosen);
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.entries});

  final List<TimelineEntry> entries;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('What has happened', style: theme.textTheme.titleMedium),
        const SizedBox(height: MzaziSpace.s12),
        if (entries.isEmpty)
          Text('Nothing recorded yet.', style: theme.textTheme.bodyMedium)
        else
          for (final TimelineEntry entry in entries)
            Padding(
              padding: const EdgeInsets.only(bottom: MzaziSpace.s8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  SizedBox(
                    width: 56,
                    child: Text('+${entry.secondsFromTrigger}s', style: theme.textTheme.bodySmall),
                  ),
                  Expanded(
                    child: Text(
                      // No actor means the system did it on its own, and saying so is
                      // the point of the trail.
                      entry.actorName == null
                          ? '${_actionWord(entry.action)} (automatic)'
                          : '${_actionWord(entry.action)} by ${entry.actorName}',
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }

  static String _actionWord(String action) {
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

/// Why the score is what it is. Closed, and below everything else.
class _SeverityReasoning extends StatelessWidget {
  const _SeverityReasoning({required this.factors, required this.score});

  final List<SeverityFactor> factors;
  final int score;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    if (factors.isEmpty) return const SizedBox.shrink();

    return Theme(
      // Removes the divider the expansion tile draws by default, which the token set
      // has no line for at that weight.
      data: theme.copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: MzaziSpace.s8),
        title: Text('How this was scored', style: theme.textTheme.titleMedium),
        subtitle: Text(
          '${factors.length} factors, scoring $score',
          style: theme.textTheme.bodySmall,
        ),
        children: <Widget>[
          for (final SeverityFactor factor in factors)
            Padding(
              padding: const EdgeInsets.only(bottom: MzaziSpace.s8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  SizedBox(
                    width: 40,
                    child: Text('+${factor.contribution}', style: theme.textTheme.bodySmall),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(factor.label, style: theme.textTheme.bodyMedium),
                        if (factor.detail != null)
                          Text(factor.detail!, style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
