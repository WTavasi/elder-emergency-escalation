import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/location/share_way_panel.dart';
import '../../core/location/way_there.dart';
import '../../core/map/emergency_map.dart';
import '../../core/theme/theme.dart';
import '../../core/voice/voice_call.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/emergency_type_icon.dart';
import '../../core/widgets/fade_swap.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/section_label.dart';
import '../../core/widgets/swipe_to_confirm.dart';
import '../voice/call_screen.dart';
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

  /// The map full screen, kept up to date while it is open, with directions under it.
  void _openMap(BuildContext context, AlertDetailController controller, AlertSummary alert) {
    final WayThere? way = controller.wayThere;
    unawaited(
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (BuildContext _) => EmergencyMapScreen(
            listenable: Listenable.merge(<Listenable?>[controller, way]),
            read: () => _mapOf(controller, alert)?.contents,
            actions: <Widget>[
              DirectionsButton(
                latitude: alert.latitude!,
                longitude: alert.longitude!,
                addressLabel: alert.addressLabel,
                open: widget.open,
              ),
            ],
          ),
        ),
      ),
    );
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
          padding: EdgeInsets.fromLTRB(
            MzaziLayout.margin(context),
            0,
            MzaziLayout.margin(context),
            MzaziSpace.s32,
          ),
          children: <Widget>[
            _Header(alert: alert),
            _OnTheWay(
              controller: controller,
              alert: alert,
              journeys: detail?.journeys ?? const <Journey>[],
              volunteerName: detail?.volunteer?.name,
            ),
            if (detail?.volunteer case final VolunteerOnAlert volunteer) ...<Widget>[
              const SizedBox(height: MzaziSpace.s24),
              _Volunteer(
                volunteer: volunteer,
                elderFirst: alert.elderName.split(' ').first,
                open: alert.state.isOpen,
                canOpen: widget.canOpen,
                openLink: widget.open,
              ),
            ],
            if (detail != null && detail.stations.isNotEmpty) ...<Widget>[
              const SizedBox(height: MzaziSpace.s24),
              _Stations(stations: detail.stations),
            ],
            if (controller.canTalk) ...<Widget>[
              const SizedBox(height: MzaziSpace.s24),
              _Talk(controller: controller, alert: alert, startedBy: detail?.voice.startedBy),
            ] else if (controller.talkIsOff) ...<Widget>[
              // Said plainly, so nobody looks for a button that is not there. Phoning
              // is right above.
              const SizedBox(height: MzaziSpace.s24),
              const Notice(message: "Calls through the app aren't available right now."),
            ],
            if (alert.addressLabel != null || alert.hasPlace) ...<Widget>[
              const SizedBox(height: MzaziSpace.s24),
              const SectionLabel('Where'),
              const SizedBox(height: MzaziSpace.s12),
              if (alert.addressLabel != null)
                Text(alert.addressLabel!, style: theme.textTheme.bodyLarge),
              if (_mapOf(controller, alert) case final EmergencyMapData map) ...<Widget>[
                const SizedBox(height: MzaziSpace.s12),
                EmergencyMap(
                  destination: map.destination,
                  destinationLabel: map.destinationLabel,
                  travellers: map.travellers,
                  needsSomebody: map.needsSomebody,
                  onOpen: () => _openMap(context, controller, alert),
                ),
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
              Text('Emergency closed. Nothing more to do.', style: theme.textTheme.bodyLarge),
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
              Text(
                "Couldn't refresh this. Pull down to try again.",
                style: theme.textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
      // The decision sits at the bottom of the screen, where the thumb already is, and
      // stays there while the trail above scrolls. It used to be halfway down the page.
      bottomNavigationBar: alert.state.isOpen
          ? _ActionBar(
              // A step taken, such as the swipe on arriving, fades and folds away into
              // what comes next instead of vanishing from under the thumb.
              child: FadeSwap(
                child: KeyedSubtree(
                  key: ValueKey<String>(
                    '${alert.isAnswered}-${controller.isOnTheWay}-${alert.arrivedAt != null}',
                  ),
                  child: _Actions(
                    controller: controller,
                    alert: alert,
                    canOpen: widget.canOpen,
                    open: widget.open,
                  ),
                ),
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
          padding: EdgeInsets.fromLTRB(
            MzaziLayout.margin(context),
            MzaziSpace.s12,
            MzaziLayout.margin(context),
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
            SeverityMark(severity: alert.severity),
          ],
        ),
        if (alert.fromMissedCheckIn) ...<Widget>[
          const SizedBox(height: MzaziSpace.s12),
          // Said first, because it changes what to do: nobody pressed for help, and a
          // call settles most of these in a minute.
          Text(
            'Call ${alert.elderName.split(' ').first} first. They missed a daily check-in. '
            'No one pressed for help.',
            style: theme.textTheme.bodyLarge?.weighted(MzaziWeight.strong),
          ),
        ],
        if (alert.reportedType case final EmergencyType type) ...<Widget>[
          const SizedBox(height: MzaziSpace.s12),
          Row(
            children: <Widget>[
              Icon(emergencyTypeIcon(type)),
              const SizedBox(width: MzaziSpace.s8),
              Expanded(
                child: Text(
                  '${alert.elderName.split(' ').first} says: ${type.label}',
                  style: theme.textTheme.bodyLarge?.weighted(MzaziWeight.strong),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: MzaziSpace.s12),
        Text(
          'Raised ${elapsedSince(alert.triggeredAt)}. Asking group ${alert.currentTier}.',
          style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        if (alert.ownerName != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s4),
          Text(
            alert.arrivedAt != null
                ? '${alert.ownerName} arrived ${elapsedSince(alert.arrivedAt!)}.'
                : '${alert.ownerName} is on the way.',
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
              label: const Text("I'm on my way"),
            ),
          ),
          const SizedBox(height: MzaziSpace.s8),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Expanded(
                  child: OutlinedButton(
                    style: StackedLabel.padding,
                    onPressed: busy ? null : () => _confirmDecline(context),
                    child: const StackedLabel(
                      icon: Icons.do_not_disturb_on_outlined,
                      label: 'I cannot come',
                    ),
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
                      stacked: true,
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
            label: "Swipe when you're with $first",
            enabled: !busy,
            onConfirmed: () => unawaited(controller.arrived()),
          ),
          const SizedBox(height: MzaziSpace.s8),
          _callAndResponder(context, busy, phone),
          const SizedBox(height: MzaziSpace.s4),
          TextButton(
            onPressed: busy ? null : () => _chooseOutcome(context),
            child: const Text('Close emergency'),
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
            label: const Text('Close emergency'),
          ),
        ),
        const SizedBox(height: MzaziSpace.s8),
        _callAndResponder(context, busy, phone),
      ],
    );
  }

  /// Ringing the elder and asking for a responder, side by side. The responder button is
  /// left out for an emergency responder, and once somebody has asked, a line says so.
  Widget _callAndResponder(BuildContext context, bool busy, String? phone) {
    final bool offerResponder = controller.canAskForResponder;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // Side by side, as asked. IntrinsicHeight and stretch keep the pair the same
        // height when one label wraps to two lines, which "Ask for an emergency responder"
        // will in half a phone's width. No fixed 48-point box here: it would clip the
        // wrapped label, and the theme already guarantees the 48-point floor. Each child
        // is Expanded because the theme's buttons are infinitely wide by design, and a
        // row gives an unexpanded child no width limit at all.
        if (phone != null || offerResponder)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                if (phone != null)
                  Expanded(
                    child: CallButton(
                      name: alert.elderName,
                      phone: phone,
                      canOpen: canOpen,
                      open: open,
                      stacked: true,
                    ),
                  ),
                if (phone != null && offerResponder) const SizedBox(width: MzaziSpace.s8),
                if (offerResponder)
                  Expanded(
                    // A different icon from Call Grace on purpose. Both labels start with
                    // "Call" and they do different things: one rings her, the other sends
                    // the emergency on through the system and rings nobody. Both amber, the
                    // colour of an emergency waiting on a person; this one solid, because it
                    // is the bigger step.
                    child: FilledButton(
                      style: CallStyle.strong(context).merge(StackedLabel.padding),
                      onPressed: busy ? null : () => unawaited(_chooseService(context)),
                      child: StackedLabel(
                        icon: Icons.emergency,
                        label: controller.servicesAsked.isEmpty
                            ? controller.serviceNeeded.ask
                            : 'Ask for another service',
                      ),
                    ),
                  ),
              ],
            ),
          ),
        if (controller.responderAsked) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Text(
            controller.askedLine,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ],
    );
  }

  /// Which service to ask now. The one the emergency needs comes first and is the
  /// button; the others are rows under it, and any already asked is left out. The
  /// nearest station of the one chosen is asked at once.
  Future<void> _chooseService(BuildContext context) async {
    final List<ResponderService> offer = controller.servicesToOffer;
    if (offer.isEmpty) return;
    final ResponderService? chosen = await showActionSheet<ResponderService>(
      context,
      title: 'Who should we ask?',
      message: "We'll ask the nearest one now.",
      actions: <SheetAction<ResponderService>>[
        for (final (int index, ResponderService service) in offer.indexed)
          SheetAction<ResponderService>(
            service.title,
            service,
            icon: serviceIcon(service),
            primary: index == 0,
          ),
      ],
    );
    if (chosen != null) await controller.requestResponder(chosen);
  }

  /// Declining sends the emergency onward immediately, so it is confirmed rather than
  /// fired from a single press. The reason is optional: asking for one is useful, and
  /// requiring one would slow down the exact moment nobody should be slowed down.
  Future<void> _confirmDecline(BuildContext context) async {
    final TextEditingController reason = TextEditingController();

    final bool? confirmed = await showActionSheet<bool>(
      context,
      title: 'Cannot come?',
      message: "We'll ask the next person right away.",
      content: TextField(
        controller: reason,
        maxLength: 200,
        textInputAction: TextInputAction.done,
        decoration: const InputDecoration(
          labelText: 'Reason (optional)',
          hintText: 'At work, two hours away',
        ),
      ),
      actions: const <SheetAction<bool>>[
        SheetAction<bool>(
          'I cannot come',
          true,
          icon: Icons.do_not_disturb_on_outlined,
          primary: true,
        ),
        SheetAction<bool>('Go back', false, icon: Icons.close),
      ],
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
      builder: (BuildContext _) => _OutcomeSheet(reported: alert.reportedType),
    );

    if (closure != null) {
      await controller.resolve(
        closure.outcome,
        note: closure.note,
        confirmedType: closure.confirmedType,
      );
    }
  }
}

/// What came back from the sheet: the outcome, the words if any were written, and what
/// it actually was.
class _Closure {
  const _Closure(this.outcome, this.note, this.confirmedType);

  final Outcome outcome;
  final String? note;
  final EmergencyType? confirmedType;
}

/// How it ended.
///
/// Two steps rather than one screen of controls. Step one is the question and its five
/// answers; step two only exists for "Something else", where the answer has to be written
/// rather than chosen. Putting a text field on the first step would have made every closure
/// look like it needed typing, and most do not.
class _OutcomeSheet extends StatefulWidget {
  const _OutcomeSheet({this.reported});

  /// What the elder said it was, chosen to start with so confirming it is no extra tap.
  final EmergencyType? reported;

  @override
  State<_OutcomeSheet> createState() => _OutcomeSheetState();
}

class _OutcomeSheetState extends State<_OutcomeSheet> {
  final TextEditingController _note = TextEditingController();
  bool _writing = false;
  bool _tooShort = false;
  late EmergencyType? _type = widget.reported;

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
                // Below the sheet's grab handle, which leaves the room above the question.
                padding: EdgeInsets.fromLTRB(
                  MzaziLayout.margin(context),
                  0,
                  MzaziLayout.margin(context),
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
                      Text('One sentence is enough.', style: theme.textTheme.bodySmall),
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
    crossAxisAlignment: CrossAxisAlignment.start,
    children: <Widget>[
      // What it was, before how it ended: confirmed here, it says how often the elder's
      // own report was right.
      Padding(
        padding: EdgeInsets.fromLTRB(
          MzaziLayout.margin(context),
          MzaziSpace.s4,
          MzaziLayout.margin(context),
          MzaziSpace.s8,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('What was it?', style: theme.textTheme.titleSmall),
            const SizedBox(height: MzaziSpace.s8),
            Wrap(
              spacing: MzaziSpace.s8,
              runSpacing: MzaziSpace.s8,
              children: <Widget>[
                for (final EmergencyType type in EmergencyType.values)
                  ChoiceChip(
                    label: Text(type.label),
                    avatar: Icon(emergencyTypeIcon(type), size: 18),
                    selected: _type == type,
                    onSelected: (bool on) => setState(() => _type = on ? type : null),
                  ),
              ],
            ),
          ],
        ),
      ),
      for (final Outcome outcome in Outcome.values)
        ListTile(
          title: Text(outcome.label, style: theme.textTheme.bodyLarge),
          subtitle: Text(outcome.hint, style: theme.textTheme.bodySmall),
          trailing: outcome.needsNote ? const Icon(Icons.chevron_right) : null,
          // In line with the question above.
          contentPadding: EdgeInsets.symmetric(horizontal: MzaziLayout.margin(context)),
          minTileHeight: MzaziSizes.of(context).target,
          onTap: () {
            if (outcome.needsNote) {
              setState(() => _writing = true);
            } else {
              Navigator.of(context).pop(_Closure(outcome, null, _type));
            }
          },
        ),
    ],
  );

  Widget _writingStep(ThemeData theme) => Padding(
    padding: EdgeInsets.fromLTRB(
      MzaziLayout.margin(context),
      MzaziSpace.s8,
      MzaziLayout.margin(context),
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
            hintText: 'Locked out. A neighbour let them in.',
            errorText: _tooShort ? 'Add a few words about what happened.' : null,
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
                  Navigator.of(context).pop(_Closure(Outcome.other, text, _type));
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
        const SectionLabel('What happened'),
        const SizedBox(height: MzaziSpace.s16),
        if (shown.isEmpty)
          Text('Nothing recorded yet.', style: theme.textTheme.bodyMedium)
        else
          // Numbered, on a line from the first thing that happened to the latest, as the
          // console draws an emergency's chain. The latest is filled in.
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              for (int i = 0; i < shown.length; i++)
                _Step(
                  number: i + 1,
                  last: i == shown.length - 1,
                  title: _sentence(shown[i]),
                  when: _when(shown[i].secondsFromTrigger),
                ),
            ],
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
    final String who = entry.actorName ?? 'Someone';

    return switch (entry.action) {
      'EVENT_CREATED' when entry.trigger == AlertTrigger.missedCheckIn =>
        'Missed the daily check-in',
      'EVENT_CREATED' => entry.byText ? '$who asked for help, by text' : '$who asked for help',
      'CHECKED_IN_LATE' => '$who answered the check-in late',
      'VOLUNTEERS_ASKED' => 'Asked volunteers nearby',
      'VOLUNTEER_ACCEPTED' => '$who (volunteer) is going',
      'VOLUNTEER_WITHDREW' => '$who (volunteer) can no longer go',
      'VOLUNTEER_ARRIVED' => '$who (volunteer) arrived',
      'TIER_DISPATCHED' => _dispatched(entry),
      'ESCALATED' => _escalated(entry),
      'ACKNOWLEDGED' => entry.byText ? '$who is on the way, by text' : '$who is on the way',
      'ARRIVED' => '$who arrived',
      'VOICE_JOINED' => '$who joined the call',
      'DECLINED' => entry.byText ? '$who cannot come, by text' : '$who cannot come',
      'RESPONDER_REQUESTED' => '$who asked for an emergency responder',
      'TYPE_REPORTED' => _reported(who, entry),
      'SERVICE_DISPATCHED' => _serviceAsked(entry),
      'STATION_ASKED' => _stationAsked(entry),
      'RESOLVED' => '$who closed it',
      'CANCELLED' when entry.reason == 'checked-in-late' => 'Cancelled: $who answered the check-in',
      'CANCELLED' => '$who cancelled it',
      'REOPENED' => '$who reopened it',
      // An action added on the server after this screen was written. Better a tidied
      // version of the real name than a blank line pretending nothing happened.
      _ => _titleCase(entry.action),
    };
  }

  /// Names the people if the chain says who sits at that tier, because "Sent to Mary
  /// Otieno" is worth more to a reader than "Sent to tier 1".
  /// "Grace said: fire", by text when it came by text.
  static String _reported(String who, TimelineEntry entry) {
    final String what = entry.type?.label.toLowerCase() ?? 'something';
    return entry.byText ? '$who said: $what, by text' : '$who said: $what';
  }

  /// "Fire service asked at once", or that none covers the place.
  /// "Kilimani Police Station asked, about 6 minutes away by road".
  static String _stationAsked(TimelineEntry entry) {
    final int? seconds = entry.seconds;
    final String away = seconds == null
        ? ''
        : ', ${timeAway(seconds)} away${entry.byRoad ? ' by road' : ''}';
    final String why = switch (entry.reason) {
      'declined' => ' after the one before could not come',
      'no-answer' => ' after no answer from the one before',
      _ => '',
    };
    return '${entry.stationName ?? 'A station'} asked$away$why';
  }

  static String _serviceAsked(TimelineEntry entry) {
    final ResponderService service = entry.service ?? ResponderService.general;
    return entry.recipients == 0
        ? 'No ${service.title.toLowerCase()} covers the place, so volunteers nearby were asked'
        : '${service.title} asked at once';
  }

  String _dispatched(TimelineEntry entry) {
    final int? tier = entry.tier;
    if (tier == null) return 'Sent to group 1';

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
    if (to == null) return 'No answer. No one else to ask';

    final List<String> names = chain
        .where((ChainMember m) => m.priorityOrder == to)
        .map((ChainMember m) => m.name)
        .toList();

    return names.isEmpty
        ? 'No answer in time. Asking the next group'
        : 'No answer in time. Now asking ${names.join(' and ')}';
  }

  /// Relative to the alert, in units a person reads without counting zeroes.
  static String _when(int seconds) {
    if (seconds <= 0) return 'at the start';
    if (seconds < 60) return '$seconds ${seconds == 1 ? 'second' : 'seconds'} after the alert';
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
        const SectionLabel("Who we're asking"),
        if (members.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: MzaziSpace.s16),
            child: Text('No one is set up to help yet.', style: theme.textTheme.bodyMedium),
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
                      style: theme.textTheme.titleLarge?.figures,
                      semanticsLabel: 'Group ${member.priorityOrder}',
                    ),
                  ),
                  Expanded(child: Text(member.name, style: theme.textTheme.bodyLarge)),
                  if (member.priorityOrder == currentTier)
                    Text(
                      'Asking now',
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

/// Community volunteers asked about this emergency, and the one going.
///
/// Said as going beside the chain, never as having taken it on: the buttons below are
/// still the circle's to press, whoever else is on the way.
class _Volunteer extends StatelessWidget {
  const _Volunteer({
    required this.volunteer,
    required this.elderFirst,
    required this.open,
    this.canOpen,
    this.openLink,
  });

  final VolunteerOnAlert volunteer;
  final String elderFirst;
  final bool open;
  final CanOpen? canOpen;
  final Open? openLink;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? name = volunteer.name;
    final String? phone = volunteer.phone;
    final int? metres = volunteer.distanceMetres;

    final String line = volunteer.going && name != null
        ? volunteer.hasArrived
              ? '$name, a checked volunteer, is with $elderFirst.'
              : '$name, a checked volunteer${metres == null ? '' : ' ${howFarAway(metres, byRoad: volunteer.byRoad)}'}, is on the way.'
        : volunteer.asked == 0
        ? 'No volunteers free nearby.'
        : open
        ? 'Asked ${volunteer.asked} ${volunteer.asked == 1 ? 'volunteer' : 'volunteers'} nearby. No answer yet.'
        : 'Asked ${volunteer.asked} ${volunteer.asked == 1 ? 'volunteer' : 'volunteers'} nearby.';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const SectionLabel('Community volunteers'),
        const SizedBox(height: MzaziSpace.s12),
        Text(line, style: theme.textTheme.bodyLarge),
        if (open && volunteer.going && name != null && phone != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s12),
          SizedBox(
            width: double.infinity,
            child: CallButton(
              name: name.split(' ').first,
              phone: phone,
              canOpen: canOpen,
              open: openLink,
            ),
          ),
        ],
      ],
    );
  }
}

/// The emergency services asked, as a list: each station, whether it is asked, cannot
/// come or is coming, and roughly how far it is.
///
/// The time is the station's own distance by road. The unit may be out on a call
/// somewhere else, so it is said as an estimate and as "from the station".
class _Stations extends StatelessWidget {
  const _Stations({required this.stations});

  final List<StationOnAlert> stations;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const SectionLabel('Emergency services'),
        const SizedBox(height: MzaziSpace.s4),
        for (final (int index, StationOnAlert station) in stations.indexed) ...<Widget>[
          if (index > 0) const Divider(),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(station.name, style: theme.textTheme.titleMedium),
                const SizedBox(height: MzaziSpace.s4),
                Text(stationLine(station), style: theme.textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// "Asked. About 6 minutes away by road, from the station." in plain words.
String stationLine(StationOnAlert station) {
  final String status = station.declined
      ? "Can't come."
      : station.coming
      ? 'On the way.'
      : 'Asked, no answer yet.';
  final int? eta = station.etaSeconds;
  if (station.declined || eta == null) return status;
  final String away = timeAway(eta);
  final String how = station.byRoad ? ' by road' : '';
  return '$status ${away[0].toUpperCase()}${away.substring(1)} away$how, from the station.';
}

/// Who is on their way, and how long until they arrive.
///
/// For the person who took it on: sharing their own way there. For everybody else in
/// the circle: each person on their way and the time left, the one who took it on and
/// the volunteer alike. Where they are is on the map, under Where. Nothing once nobody
/// is on their way.
class _OnTheWay extends StatelessWidget {
  const _OnTheWay({
    required this.controller,
    required this.alert,
    this.journeys = const <Journey>[],
    this.volunteerName,
  });

  final AlertDetailController controller;
  final AlertSummary alert;
  final List<Journey> journeys;
  final String? volunteerName;

  @override
  Widget build(BuildContext context) {
    if (!alert.state.isOpen) return const SizedBox.shrink();

    final List<Widget> children = <Widget>[];
    final WayThere? way = controller.wayThere;
    if (controller.isMine && alert.arrivedAt == null && way != null) {
      Journey? mine;
      for (final Journey journey in journeys) {
        if (journey.traveller == Traveller.owner) mine = journey;
      }
      children.add(
        ShareWayPanel(
          way: way,
          eventId: alert.eventId,
          elderFirst: alert.elderName.split(' ').first,
          journey: mine,
        ),
      );
    }

    for (final Journey journey in journeys) {
      // Their own way there is in the panel above.
      if (controller.isMine && journey.traveller == Traveller.owner) continue;
      final String? name = journey.traveller == Traveller.owner ? alert.ownerName : volunteerName;
      if (name == null) continue;
      if (children.isNotEmpty) children.add(const SizedBox(height: MzaziSpace.s16));
      children.add(_Travelling(name: name.split(' ').first, journey: journey));
    }

    if (children.isEmpty) return const SizedBox.shrink();
    return Padding(
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
  }
}

/// One person on their way: "Peter is about 9 minutes away", and how that was measured.
class _Travelling extends StatelessWidget {
  const _Travelling({required this.name, required this.journey});

  final String name;
  final Journey journey;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String how = journey.byRoad ? 'by road' : 'in a straight line';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('$name is ${timeAway(journey.etaSeconds)} away', style: theme.textTheme.titleLarge),
        const SizedBox(height: MzaziSpace.s4),
        Text(
          '${distanceWords(journey.distanceMetres)} $how, updated '
          '${elapsedSince(journey.updatedAt)}.',
          style: theme.textTheme.bodyMedium,
        ),
      ],
    );
  }
}

/// Everybody on the map: each journey that carries a position, by name, with this
/// phone's own way there as fresh as this phone knows it.
EmergencyMapData? _mapOf(AlertDetailController controller, AlertSummary fallback) {
  final AlertDetail? detail = controller.detail;
  final AlertSummary alert = detail?.summary ?? fallback;
  if (!alert.state.isOpen || !alert.hasPlace) return null;

  final WayThere? way = controller.wayThere;
  final Journey? live = controller.isMine && way != null && way.isSharingFor(alert.eventId)
      ? way.journey
      : null;

  final List<MapTraveller> travellers = <MapTraveller>[];
  bool placedMine = false;
  for (final Journey journey in detail?.journeys ?? const <Journey>[]) {
    final bool owner = journey.traveller == Traveller.owner;
    final bool mine = owner && controller.isMine;
    final String? name = owner ? alert.ownerName : detail?.volunteer?.name;
    if (name == null) continue;
    final MapTraveller? who = MapTraveller.fromJourney(
      mine && live != null && live.hasPosition ? live : journey,
      name,
      isYou: mine,
    );
    if (who != null) travellers.add(who);
    if (mine) placedMine = true;
  }
  // Sharing has started here but the emergency has not been re-read since.
  if (!placedMine && live != null) {
    final MapTraveller? who = MapTraveller.fromJourney(live, alert.ownerName ?? '', isYou: true);
    if (who != null) travellers.add(who);
  }

  return EmergencyMapData(
    destination: MapPoint(alert.latitude!, alert.longitude!),
    destinationLabel: alert.elderName.split(' ').first,
    travellers: travellers,
    needsSomebody: !alert.isAnswered,
  );
}

/// Talking to the elder through the app.
///
/// Beside ringing rather than instead of it. A phone call needs the elder to reach the
/// phone and answer; this joins their phone by itself when MzaziCare is open on it, on the
/// speaker, which is the case that matters for somebody who has fallen.
class _Talk extends StatelessWidget {
  const _Talk({required this.controller, required this.alert, this.startedBy});

  final AlertDetailController controller;
  final AlertSummary alert;
  final String? startedBy;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String first = alert.elderName.split(' ').first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        OutlinedButton.icon(
          onPressed: () {
            // Made once, here, not in the route's builder, which can run more than once:
            // a second call made there would be the one disposed, and the first would
            // keep the microphone.
            final VoiceCall call = controller.newCall();
            unawaited(
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => CallScreen(call: call, elderName: alert.elderName),
                ),
              ),
            );
          },
          icon: const Icon(Icons.headset_mic_outlined),
          label: Text('Talk to $first'),
        ),
        if (startedBy != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s4),
          Text('$startedBy started a call.', style: theme.textTheme.bodySmall),
        ],
      ],
    );
  }
}

/// One numbered step of what has happened: a marker with its number, the line on to the
/// next step, and the sentence with its time beside them.
class _Step extends StatelessWidget {
  const _Step({required this.number, required this.last, required this.title, required this.when});

  final int number;
  final bool last;
  final String title;
  final String when;

  static const double _marker = 28;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color ink = theme.colorScheme.onSurface;
    final Color line = theme.colorScheme.outlineVariant;
    // The marker grows with the text, up to a point, so the number always fits in it.
    final double scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6);
    final double marker = _marker * scale;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SizedBox(
            width: marker,
            child: Column(
              children: <Widget>[
                Container(
                  width: marker,
                  height: marker,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    // The latest step filled, the earlier ones outlined.
                    color: last ? ink : theme.colorScheme.surface,
                    border: Border.all(color: last ? ink : line, width: 2),
                  ),
                  child: Text(
                    '$number',
                    style: theme.textTheme.labelMedium?.figures.copyWith(
                      color: last ? theme.colorScheme.surface : ink,
                    ),
                    textScaler: TextScaler.linear(scale),
                  ),
                ),
                if (!last) Expanded(child: Container(width: 2, color: line)),
              ],
            ),
          ),
          const SizedBox(width: MzaziSpace.s12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : MzaziSpace.s16, top: 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(title, style: theme.textTheme.bodyLarge),
                  Text(when, style: theme.textTheme.bodySmall),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The mark for each service, the same wherever a service is named.
IconData serviceIcon(ResponderService service) => switch (service) {
  ResponderService.general => Icons.emergency,
  ResponderService.ambulance => Icons.medical_services_outlined,
  ResponderService.police => Icons.local_police_outlined,
  ResponderService.fire => Icons.local_fire_department_outlined,
};
