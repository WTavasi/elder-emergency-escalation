import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/models.dart';
import '../../core/location/position_source.dart';
import '../../core/location/way_there.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/section_label.dart';
import '../../core/widgets/swipe_to_confirm.dart';
import 'alert_detail_controller.dart';
import 'widgets/call_button.dart';
import 'widgets/directions_button.dart';
import 'widgets/severity_mark.dart';
import 'widgets/state_pill.dart';

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
  const AlertDetailScreen({required this.fallback, this.canOpen, this.open, super.key});

  /// The row the list already had. Shown immediately so the screen opens with content
  /// rather than a spinner over information the app is holding.
  final AlertSummary fallback;

  /// How a phone call is placed. Null means the device's own dialler; tests supply their
  /// own so they can see what would have been dialled.
  final CanOpen? canOpen;
  final Open? open;

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
      // A back arrow and nothing else. The name is set large in the page instead, where
      // the eye lands first.
      appBar: AppBar(),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, 0, MzaziSpace.s16, MzaziSpace.s32),
          children: <Widget>[
            _Header(alert: alert),
            _OnTheWay(
              controller: controller,
              alert: alert,
              journey: detail?.journey,
              open: widget.open,
            ),
            if (alert.addressLabel != null || alert.hasPlace) ...<Widget>[
              const SizedBox(height: MzaziSpace.s24),
              const SectionLabel('Where'),
              const SizedBox(height: MzaziSpace.s12),
              if (alert.addressLabel != null)
                Text(alert.addressLabel!, style: theme.textTheme.bodyLarge),
              if (alert.state.isOpen && alert.hasPlace) ...<Widget>[
                const SizedBox(height: MzaziSpace.s12),
                SizedBox(
                  width: double.infinity,
                  child: DirectionsButton(
                    latitude: alert.latitude!,
                    longitude: alert.longitude!,
                    addressLabel: alert.addressLabel,
                    open: widget.open,
                  ),
                ),
              ],
            ],
            if (controller.actionError != null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s24),
              Notice(message: controller.actionError!, isError: true),
            ],
            if (controller.confirmation != null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s24),
              Notice(message: controller.confirmation!),
            ],
            if (!alert.state.isOpen) ...<Widget>[
              const SizedBox(height: MzaziSpace.s24),
              Text(
                'This emergency is closed. Nothing more to do.',
                style: theme.textTheme.bodyLarge,
              ),
            ],
            const SizedBox(height: MzaziSpace.s32),
            if (detail == null && controller.isLoading)
              const Center(child: CircularProgressIndicator())
            else if (detail != null) ...<Widget>[
              _WhatHappened(entries: detail.timeline, chain: detail.chain),
              const SizedBox(height: MzaziSpace.s32),
              // No rank is "asked now" once it is over.
              _Chain(
                members: detail.chain,
                currentTier: alert.state.isOpen ? alert.currentTier : 0,
              ),
            ],
            if (controller.loadError != null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s16),
              Text('Could not refresh: ${controller.loadError}', style: theme.textTheme.bodySmall),
            ],
          ],
        ),
      ),
      // The decision sits at the bottom of the screen, where the thumb already is, and
      // stays there while the trail above scrolls. It used to be halfway down the page.
      bottomNavigationBar: alert.state.isOpen
          ? _ActionBar(
              child: _Actions(
                controller: controller,
                alert: alert,
                canOpen: widget.canOpen,
                open: widget.open,
              ),
            )
          : null,
    );
  }
}

/// The bar the actions sit in: a hairline above, the page colour behind, clear of the
/// home indicator.
class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            MzaziSpace.s16,
            MzaziSpace.s12,
            MzaziSpace.s16,
            MzaziSpace.s12,
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Who, then the state and the band on one line, then what has happened so far.
///
/// It used to be a bordered box with a coloured strip down one side. The name at
/// headline size does the work the box was doing: there is no doubt which emergency
/// this screen is about, or what matters most on it.
class _Header extends StatelessWidget {
  const _Header({required this.alert});

  final AlertSummary alert;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(header: true, child: Text(alert.elderName, style: theme.textTheme.headlineLarge)),
        const SizedBox(height: MzaziSpace.s12),
        Wrap(
          spacing: MzaziSpace.s16,
          runSpacing: MzaziSpace.s8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: <Widget>[
            StatePill(state: alert.state),
            SeverityMark(severity: alert.severity, suffix: ' severity'),
          ],
        ),
        const SizedBox(height: MzaziSpace.s12),
        Text(
          'Raised ${elapsedSince(alert.triggeredAt)}, at tier ${alert.currentTier}.',
          style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        if (alert.ownerName != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s4),
          Text(
            alert.arrivedAt != null
                ? '${alert.ownerName} arrived ${elapsedSince(alert.arrivedAt!)}.'
                : '${alert.ownerName} is responding.',
            style: theme.textTheme.bodyLarge?.weighted(MzaziWeight.strong),
          ),
        ],
        if (alert.outcome != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s4),
          Text('Closed: ${_outcomeWord(alert.outcome!)}', style: theme.textTheme.bodyLarge),
          if (alert.outcomeNote != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s4),
            // What the person who closed it actually wrote. For an "other" outcome this
            // is the only record of what happened, so it is shown rather than filed away.
            Text('"${alert.outcomeNote}"', style: theme.textTheme.bodyMedium),
          ],
        ],
      ],
    );
  }

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
  const _Actions({required this.controller, required this.alert, this.canOpen, this.open});

  final AlertDetailController controller;
  final AlertSummary alert;
  final CanOpen? canOpen;
  final Open? open;

  @override
  Widget build(BuildContext context) {
    // Shown only while the emergency is open; a closed one says so in the page instead.
    if (!alert.state.isOpen) return const SizedBox.shrink();

    final bool busy = controller.isWorking;
    final String? phone = alert.elderPhone;

    if (!alert.isAnswered) {
      // The commitment full width on top, the two other answers side by side under it,
      // so the bar stays two rows tall on a small phone. Ringing her is here because it
      // is the most natural first move of all, and it is never disabled while an action
      // is in flight: nothing about a call can interfere with an acknowledgement.
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: busy ? null : controller.acknowledge,
              icon: const Icon(Icons.directions_run),
              label: const Text('I am on my way'),
            ),
          ),
          const SizedBox(height: MzaziSpace.s8),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy ? null : () => _confirmDecline(context),
                    icon: const Icon(Icons.do_not_disturb_on_outlined),
                    label: const Text('I cannot come', textAlign: TextAlign.center),
                  ),
                ),
                if (phone != null) ...<Widget>[
                  const SizedBox(width: MzaziSpace.s8),
                  Expanded(
                    child: CallButton(
                      name: alert.elderName,
                      phone: phone,
                      canOpen: canOpen,
                      open: open,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    }

    if (controller.isOnTheWay) {
      // On the way, the next thing that happens is arriving, so that is the large
      // target, and a swipe rather than a tap: "I'm here" sent from a pocket would tell
      // the elder help is in the room when it is still on the road. Closing stays
      // possible, because "she was fine, I rang her" is a real ending, but it steps back
      // to a quiet button underneath.
      final String first = alert.elderName.split(' ').first;
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SwipeToConfirm(
            label: 'Swipe when you are with $first',
            enabled: !busy,
            onConfirmed: () => unawaited(controller.arrived()),
          ),
          const SizedBox(height: MzaziSpace.s8),
          _callAndResponder(busy, phone),
          TextButton(
            onPressed: busy ? null : () => _chooseOutcome(context),
            child: const Text('Close this emergency'),
          ),
        ],
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: busy ? null : () => _chooseOutcome(context),
            icon: const Icon(Icons.check_circle_outline),
            label: const Text('Close this emergency'),
          ),
        ),
        const SizedBox(height: MzaziSpace.s8),
        _callAndResponder(busy, phone),
      ],
    );
  }

  /// Ringing her and calling in a responder, side by side.
  Widget _callAndResponder(bool busy, String? phone) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        // Side by side, as asked. IntrinsicHeight and stretch keep the pair the same
        // height when one label wraps to two lines, which "Call an emergency responder"
        // will in half a phone's width. No fixed 48-point box here: it would clip the
        // wrapped label, and the theme already guarantees the 48-point floor. Each child
        // is Expanded because the theme's buttons are infinitely wide by design, and a
        // row gives an unexpanded child no width limit at all.
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (phone != null) ...<Widget>[
                Expanded(
                  child: CallButton(
                    name: alert.elderName,
                    phone: phone,
                    canOpen: canOpen,
                    open: open,
                  ),
                ),
                const SizedBox(width: MzaziSpace.s8),
              ],
              Expanded(
                // A different icon from Call Grace on purpose. Both labels start with
                // "Call" and they do different things: one rings her, the other sends
                // the emergency on through the system and rings nobody.
                child: OutlinedButton.icon(
                  onPressed: busy ? null : controller.requestResponder,
                  icon: const Icon(Icons.emergency),
                  label: const Text('Call an emergency responder', textAlign: TextAlign.center),
                ),
              ),
            ],
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
                    if (_writing) ...<Widget>[
                      const SizedBox(height: MzaziSpace.s4),
                      Text('A sentence is enough.', style: theme.textTheme.bodySmall),
                    ],
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

/// The trail, as sentences down a hairline, newest last.
///
/// It had a circled icon per entry. The icons repeated what each sentence said, in a
/// shape that had to be learned, so they were decoration. A line down the left still
/// makes it read as a sequence.
class _WhatHappened extends StatelessWidget {
  const _WhatHappened({required this.entries, required this.chain});

  final List<TimelineEntry> entries;
  final List<ChainMember> chain;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final List<TimelineEntry> shown = entries.where(_isWorthShowing).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const SectionLabel('What has happened'),
        const SizedBox(height: MzaziSpace.s16),
        if (shown.isEmpty)
          Text('Nothing recorded yet.', style: theme.textTheme.bodyMedium)
        else
          DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                left: BorderSide(color: theme.dividerColor, width: MzaziStroke.focus),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                for (final TimelineEntry entry in shown)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      MzaziSpace.s16,
                      MzaziSpace.s4,
                      0,
                      MzaziSpace.s12,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(_sentence(entry), style: theme.textTheme.bodyLarge),
                        Text(_when(entry.secondsFromTrigger), style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
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
      'ARRIVED' => '$who arrived',
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

/// Who is asked, by rank: the number large in the monospaced face, then the name. The
/// rank being asked now is marked in red, with the words saying so.
class _Chain extends StatelessWidget {
  const _Chain({required this.members, required this.currentTier});

  final List<ChainMember> members;
  final int currentTier;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const SectionLabel('Who is being asked'),
        if (members.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: MzaziSpace.s16),
            child: Text('Nobody is configured for this elder.', style: theme.textTheme.bodyMedium),
          )
        else
          for (final ChainMember member in members) ...<Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: <Widget>[
                  SizedBox(
                    width: MzaziSpace.s32,
                    child: Text(
                      '${member.priorityOrder}',
                      style: theme.textTheme.titleLarge?.copyWith(fontFamily: MzaziFont.mono),
                      semanticsLabel: 'Tier ${member.priorityOrder}',
                    ),
                  ),
                  Expanded(child: Text(member.name, style: theme.textTheme.bodyLarge)),
                  if (member.priorityOrder == currentTier)
                    Text(
                      'Asked now',
                      style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.error),
                    ),
                ],
              ),
            ),
            const Divider(),
          ],
      ],
    );
  }
}

/// The way there, while the person who took it on is travelling.
///
/// For that person: whether their way there is being shared, and how long they have
/// left. For everybody else in the circle: how long until somebody is with her, and a
/// link to see where they are now. Nothing at all once they have arrived.
class _OnTheWay extends StatelessWidget {
  const _OnTheWay({required this.controller, required this.alert, this.journey, this.open});

  final AlertDetailController controller;
  final AlertSummary alert;
  final Journey? journey;
  final Open? open;

  @override
  Widget build(BuildContext context) {
    if (!alert.state.isOpen || alert.ownerName == null || alert.arrivedAt != null) {
      return const SizedBox.shrink();
    }

    final WayThere? way = controller.wayThere;
    if (controller.isMine) {
      if (way == null) return const SizedBox.shrink();
      return ListenableBuilder(
        listenable: way,
        builder: (BuildContext context, Widget? _) => _mine(context, way),
      );
    }

    final Journey? shared = journey;
    if (shared == null) return const SizedBox.shrink();
    return _theirs(context, shared);
  }

  Widget _mine(BuildContext context, WayThere way) {
    final ThemeData theme = Theme.of(context);
    final String elder = alert.elderName.split(' ').first;
    final List<Widget> children;

    if (way.isSharingFor(alert.eventId)) {
      final Journey? latest = way.journey ?? journey;
      final Color live = theme.colorScheme.primary;
      children = <Widget>[
        // A plain status line first, in the brand ink with the location mark, so it is
        // clear at a glance that the phone is sharing right now.
        Row(
          children: <Widget>[
            Icon(Icons.my_location, size: 20, color: live),
            const SizedBox(width: MzaziSpace.s8),
            Text('Sharing your location', style: theme.textTheme.labelLarge?.copyWith(color: live)),
          ],
        ),
        const SizedBox(height: MzaziSpace.s8),
        Text(
          latest == null
              ? 'Finding where you are'
              : '${_capitalised(timeAway(latest.etaSeconds))} to $elder',
          style: theme.textTheme.titleLarge,
        ),
        const SizedBox(height: MzaziSpace.s4),
        Text('Sharing stops when you arrive.', style: theme.textTheme.bodyMedium),
        const SizedBox(height: MzaziSpace.s12),
        // A full button rather than a text link, in the error ink, because stopping
        // takes the time away from somebody waiting for help. It asks first.
        OutlinedButton.icon(
          onPressed: () => unawaited(_confirmStop(context, way, elder)),
          icon: const Icon(Icons.location_off_outlined),
          label: const Text('Stop sharing'),
          style: OutlinedButton.styleFrom(
            foregroundColor: theme.colorScheme.error,
            side: BorderSide(color: theme.colorScheme.error),
          ),
        ),
      ];
    } else if (way.eventId == alert.eventId && way.problem != null) {
      final bool settings =
          way.access == LocationAccess.deniedForever || way.access == LocationAccess.serviceOff;
      children = <Widget>[
        Notice(message: way.problem!, isError: true),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: settings
              ? TextButton(
                  onPressed: () => unawaited(way.openSettings()),
                  child: const Text('Open settings'),
                )
              : TextButton(
                  onPressed: () => unawaited(way.shareFor(alert.eventId)),
                  child: const Text('Try sharing again'),
                ),
        ),
      ];
    } else if (way.enabled) {
      children = <Widget>[
        Text('Your way there is not being shared.', style: theme.textTheme.bodyMedium),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            onPressed: () => unawaited(way.shareFor(alert.eventId)),
            child: const Text('Share my way there'),
          ),
        ),
      ];
    } else {
      children = <Widget>[
        Text(
          'Turn on "Share my way there" under Me, and $elder will see how long you '
          'will be.',
          style: theme.textTheme.bodyMedium,
        ),
      ];
    }

    return _section(children);
  }

  Widget _theirs(BuildContext context, Journey shared) {
    final ThemeData theme = Theme.of(context);
    final String owner = alert.ownerName!.split(' ').first;
    final String how = shared.byRoad ? 'by road' : 'in a straight line';

    return _section(<Widget>[
      Text('$owner is ${timeAway(shared.etaSeconds)} away', style: theme.textTheme.titleLarge),
      const SizedBox(height: MzaziSpace.s4),
      Text(
        '${distanceWords(shared.distanceMetres)} $how, updated '
        '${elapsedSince(shared.updatedAt)}.',
        style: theme.textTheme.bodyMedium,
      ),
      if (shared.hasPosition) ...<Widget>[
        const SizedBox(height: MzaziSpace.s12),
        SizedBox(
          width: double.infinity,
          child: _SeeWhere(
            name: owner,
            latitude: shared.latitude!,
            longitude: shared.longitude!,
            open: open,
          ),
        ),
      ],
    ]);
  }

  Widget _section(List<Widget> children) => Padding(
    padding: const EdgeInsets.only(top: MzaziSpace.s24),
    child: Semantics(
      liveRegion: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const SectionLabel('On the way'),
          const SizedBox(height: MzaziSpace.s12),
          ...children,
        ],
      ),
    ),
  );

  /// Stopping is a choice with a cost to somebody else, so it is said plainly before it
  /// happens. The safe answer is the quiet one and keeps sharing.
  static Future<void> _confirmStop(BuildContext context, WayThere way, String elder) async {
    final ThemeData theme = Theme.of(context);
    final bool? stop = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text('Stop sharing your way there?'),
        content: Text(
          '$elder will no longer see how long you will be, and the rest of the circle will '
          'not see where you are. You can share again from this screen.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep sharing'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: theme.colorScheme.error,
              foregroundColor: theme.colorScheme.onError,
            ),
            child: const Text('Stop sharing'),
          ),
        ],
      ),
    );
    if (stop == true) way.stop();
  }

  static String _capitalised(String text) =>
      text.isEmpty ? text : '${text[0].toUpperCase()}${text.substring(1)}';
}

/// Where the person on their way is now, in the phone's maps app.
///
/// A link rather than a map in the app, for the same reasons as the directions button:
/// no map SDK, no key, and the maps app shows a place better than this app could.
class _SeeWhere extends StatelessWidget {
  const _SeeWhere({required this.name, required this.latitude, required this.longitude, this.open});

  final String name;
  final double latitude;
  final double longitude;
  final Open? open;

  Uri get uri => Uri.https('www.google.com', '/maps/search/', <String, String>{
    'api': '1',
    'query': '$latitude,$longitude',
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: () {
        final Open go = open ?? (Uri link) => launchUrl(link, mode: LaunchMode.externalApplication);
        unawaited(go(uri).catchError((Object _) => false));
      },
      icon: const Icon(Icons.near_me_outlined),
      label: Text('See where $name is'),
    );
  }
}
