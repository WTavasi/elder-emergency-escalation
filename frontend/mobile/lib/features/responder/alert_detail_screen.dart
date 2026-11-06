import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/medical_models.dart';
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
import '../../core/widgets/page_title.dart';
import '../../core/widgets/settings_list.dart';
import '../../core/widgets/swipe_to_confirm.dart';
import '../medical/medical_words.dart';
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

  /// "6 steps", counting what the trail shows.
  static String _steps(List<TimelineEntry> timeline) {
    final int count = timeline.where(_WhatHappened._isWorthShowing).length;
    return count == 1 ? '1 step' : '$count steps';
  }

  /// Opens a page of context over this one, kept up to date while it is open.
  void _openPage(BuildContext context, String title, Widget Function() build) {
    final AlertDetailController controller = context.read<AlertDetailController>();
    unawaited(
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (BuildContext _) => Scaffold(
            appBar: AppBar(),
            body: ListenableBuilder(
              listenable: controller,
              builder: (BuildContext _, Widget? _) => ListView(
                padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
                children: <Widget>[PageTitle(title), build()],
              ),
            ),
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
    final AlertMedical? medical = controller.medical;
    final String first = firstNameOf(alert.elderName);
    final EmergencyMapData? map = _mapOf(controller, alert);
    final List<SpeechHeard> said = <SpeechHeard>[
      for (final SpeechHeard heard in detail?.speech ?? const <SpeechHeard>[])
        if (heard.transcript.isNotEmpty) heard,
    ];
    final List<ChainMember> chain = detail?.chain ?? const <ChainMember>[];
    final double margin = MzaziLayout.margin(context);

    Widget notice(Widget child) =>
        Padding(padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s16, margin, 0), child: child);

    return Scaffold(
      // A back arrow and nothing else. The name is set large in the page instead, where
      // the eye lands first.
      appBar: AppBar(),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        // Most important first, all of it in view: who and how it stands, what makes it
        // worse, who is coming, what they said, where. What gives context rather than
        // decides anything (the medical record, the trail, the chain) is a tap away, on
        // pages of its own, rather than folded into this one.
        child: ListView(
          padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
          children: <Widget>[
            _Header(alert: alert, chain: chain),
            if (controller.actionError case final String error)
              notice(Notice(message: error, isError: true)),
            if (controller.confirmation case final String done) notice(Notice(message: done)),
            if (medical != null && medical.status == AlertMedicalStatus.shown && medical.serious)
              _MedicalWarning(controller: controller, medical: medical, first: first),
            if (alert.state.isOpen)
              _Now(
                controller: controller,
                alert: alert,
                detail: detail,
                canOpen: widget.canOpen,
                open: widget.open,
              ),
            if (said.isNotEmpty) _Said(heard: said.last, first: first),
            if (alert.addressLabel != null || map != null)
              GroupCard(
                title: 'Where',
                children: <Widget>[
                  if (alert.addressLabel != null)
                    Text(alert.addressLabel!, style: theme.textTheme.bodyLarge),
                  if (map != null) ...<Widget>[
                    const SizedBox(height: MzaziSpace.s12),
                    EmergencyMap(
                      destination: map.destination,
                      destinationLabel: map.destinationLabel,
                      travellers: map.travellers,
                      needsSomebody: map.needsSomebody,
                      onOpen: () => _openMap(context, controller, alert),
                    ),
                    const SizedBox(height: MzaziSpace.s12),
                    DirectionsButton(
                      latitude: alert.latitude!,
                      longitude: alert.longitude!,
                      addressLabel: alert.addressLabel,
                      open: widget.open,
                    ),
                  ],
                ],
              ),
            if (medical != null)
              _MedicalSummary(
                medical: medical,
                first: first,
                onAll: () => _openPage(
                  context,
                  'Medical details',
                  () => _MedicalRecord(
                    medical: controller.medical ?? medical,
                    elderName: alert.elderName,
                  ),
                ),
              ),
            if (detail == null && controller.isLoading)
              const Padding(
                padding: EdgeInsets.all(MzaziSpace.s32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (detail != null)
              SettingsSection(
                title: 'More',
                children: <Widget>[
                  SettingsRow(
                    icon: Icons.timeline,
                    title: 'What happened',
                    value: _steps(detail.timeline),
                    onTap: () => _openPage(
                      context,
                      'What happened',
                      () => _WhatHappened(
                        entries: controller.detail?.timeline ?? detail.timeline,
                        chain: controller.detail?.chain ?? chain,
                      ),
                    ),
                  ),
                  SettingsRow(
                    icon: Icons.groups_outlined,
                    title: "Who we're asking",
                    value: '${chain.length} ${chain.length == 1 ? 'person' : 'people'}',
                    onTap: () => _openPage(context, "Who we're asking", () {
                      final AlertSummary now = controller.detail?.summary ?? alert;
                      return _Chain(
                        members: controller.detail?.chain ?? chain,
                        currentTier: now.state.isOpen ? now.currentTier : 0,
                      );
                    }),
                  ),
                  if (said.length > 1)
                    SettingsRow(
                      icon: Icons.record_voice_over_outlined,
                      title: 'Everything $first said',
                      value: '${said.length}',
                      onTap: () => _openPage(
                        context,
                        'What $first said',
                        () => Column(
                          children: <Widget>[
                            for (final SpeechHeard heard in said.reversed)
                              _Said(heard: heard, first: first, titled: false),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            if (controller.loadError != null)
              notice(
                Text(
                  "Couldn't refresh this. Pull down to try again.",
                  style: theme.textTheme.bodySmall,
                ),
              ),
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

/// Who, large, as the page's title; then a group with how it stands: the state and the
/// band, what is happening, how long ago, who is being asked now by name, and who is
/// coming.
class _Header extends StatelessWidget {
  const _Header({required this.alert, required this.chain});

  final AlertSummary alert;
  final List<ChainMember> chain;

  /// "Asking Aisha Otieno and Brian Wanjiru", the people at the rank being asked now.
  String? _asking() {
    if (!alert.state.isOpen || alert.isAnswered) return null;
    final List<String> names = <String>[
      for (final ChainMember member in chain)
        if (member.priorityOrder == alert.currentTier) member.name,
    ];
    if (names.isEmpty) return 'Asking group ${alert.currentTier}';
    if (names.length == 1) return 'Asking ${names.single}';
    return 'Asking ${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String first = firstNameOf(alert.elderName);
    final String? asking = _asking();
    final TextStyle? soft = theme.textTheme.bodyLarge?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        PageTitle(alert.elderName),
        GroupCard(
          top: 0,
          children: <Widget>[
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
                'Call $first first. They missed a daily check-in. No one pressed for help.',
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
                      '$first says: ${type.label}',
                      style: theme.textTheme.bodyLarge?.weighted(MzaziWeight.strong),
                    ),
                  ),
                ],
              ),
            ],
            const Divider(height: MzaziSpace.s24),
            Text(
              asking == null
                  ? 'Raised ${elapsedSince(alert.triggeredAt)}.'
                  : 'Raised ${elapsedSince(alert.triggeredAt)}. $asking.',
              style: soft,
            ),
            if (alert.ownerName != null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s4),
              Text(
                alert.arrivedAt != null
                    ? '${alert.ownerName} arrived ${elapsedSince(alert.arrivedAt!)}.'
                    : '${alert.ownerName} is on the way.',
                style: theme.textTheme.bodyLarge?.weighted(MzaziWeight.strong),
              ),
            ] else if (alert.state.isOpen) ...<Widget>[
              const SizedBox(height: MzaziSpace.s4),
              Text('No one has said they are coming yet.', style: theme.textTheme.bodyLarge),
            ],
            if (alert.outcome != null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s4),
              Text('Closed: ${_outcomeWord(alert.outcome!)}', style: theme.textTheme.bodyLarge),
              if (alert.outcomeNote != null) ...<Widget>[
                const SizedBox(height: MzaziSpace.s4),
                // What the person who closed it actually wrote. For an "other" outcome
                // this is the only record of what happened, so it is shown.
                Text('"${alert.outcomeNote}"', style: theme.textTheme.bodyMedium),
              ],
            ] else if (!alert.state.isOpen) ...<Widget>[
              const SizedBox(height: MzaziSpace.s4),
              Text('Emergency closed. Nothing more to do.', style: theme.textTheme.bodyLarge),
            ],
          ],
        ),
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

    return GroupCard(
      top: 0,
      children: <Widget>[
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
      'EVENT_CREATED' => '$who asked for help${_how(entry)}',
      'CHECKED_IN_LATE' => '$who answered the check-in late',
      'VOLUNTEERS_ASKED' => 'Asked volunteers nearby',
      'VOLUNTEER_ACCEPTED' => '$who (volunteer) is going',
      'VOLUNTEER_WITHDREW' => '$who (volunteer) can no longer go',
      'VOLUNTEER_ARRIVED' => '$who (volunteer) arrived',
      'TIER_DISPATCHED' => _dispatched(entry),
      'ESCALATED' => _escalated(entry),
      'ACKNOWLEDGED' => switch (entry.etaMinutes) {
        final int minutes => '$who is on the way, by text, in about $minutes minutes',
        null => entry.byText ? '$who is on the way, by text' : '$who is on the way',
      },
      'ARRIVED' => '$who arrived',
      'VOICE_JOINED' => '$who joined the call',
      'DECLINED' => entry.byText ? '$who cannot come, by text' : '$who cannot come',
      'RESPONDER_REQUESTED' => '$who asked for an emergency responder',
      'TYPE_REPORTED' => _reported(who, entry),
      'SPEECH_HEARD' => switch (entry.heardType) {
        final EmergencyType heard => '$who spoke: ${heard.label.toLowerCase()}',
        null => '$who spoke',
      },
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
    return '$who said: $what${_how(entry)}';
  }

  /// ", by text", ", to Siri": how something was said, when not with the app's buttons.
  static String _how(TimelineEntry entry) => switch (entry.via) {
    'sms' => ', by text',
    'voice' => ', out loud',
    'siri' => ', to Siri',
    'assistant' => ', to the Assistant',
    'widget' => ', from the home screen',
    'tile' => ', from quick settings',
    _ => '',
  };

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

    return GroupCard(
      top: 0,
      children: <Widget>[
        if (members.isEmpty)
          Text('No one is set up to help yet.', style: theme.textTheme.bodyMedium)
        else
          for (final (int index, ChainMember member) in members.indexed) ...<Widget>[
            if (index > 0) const Divider(height: MzaziSpace.s24),
            Row(
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

/// Who is coming and who has been asked: each person on their way and how long, the
/// emergency services and the volunteers asked, one line each, and talking to the elder.
/// For the person who took it on, sharing their own way there comes first.
class _Now extends StatelessWidget {
  const _Now({
    required this.controller,
    required this.alert,
    required this.detail,
    this.canOpen,
    this.open,
  });

  final AlertDetailController controller;
  final AlertSummary alert;
  final AlertDetail? detail;
  final CanOpen? canOpen;
  final Open? open;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String first = firstNameOf(alert.elderName);
    final List<Widget> parts = <Widget>[];
    void add(Widget part) {
      if (parts.isNotEmpty) parts.add(const Divider(height: MzaziSpace.s24));
      parts.add(part);
    }

    final List<Journey> journeys = detail?.journeys ?? const <Journey>[];
    final WayThere? way = controller.wayThere;
    if (controller.isMine && alert.arrivedAt == null && way != null) {
      Journey? mine;
      for (final Journey journey in journeys) {
        if (journey.traveller == Traveller.owner) mine = journey;
      }
      add(ShareWayPanel(way: way, eventId: alert.eventId, elderFirst: first, journey: mine));
    }
    for (final Journey journey in journeys) {
      // Their own way there is in the panel above.
      if (controller.isMine && journey.traveller == Traveller.owner) continue;
      final String? name = journey.traveller == Traveller.owner
          ? alert.ownerName
          : detail?.volunteer?.name;
      if (name == null) continue;
      add(_Travelling(name: firstNameOf(name), journey: journey));
    }

    for (final StationOnAlert station in detail?.stations ?? const <StationOnAlert>[]) {
      add(
        _Line(
          icon: station.service == null ? Icons.emergency : serviceIcon(station.service!),
          title: station.name,
          detail: stationLine(station),
        ),
      );
    }

    final VolunteerOnAlert? volunteer = detail?.volunteer;
    if (volunteer != null) {
      final String? name = volunteer.name;
      final String? phone = volunteer.phone;
      final int? metres = volunteer.distanceMetres;
      final String line = volunteer.going && name != null
          ? volunteer.hasArrived
                ? '$name, a checked volunteer, is with $first.'
                : '$name, a checked volunteer${metres == null ? '' : ' ${howFarAway(metres, byRoad: volunteer.byRoad)}'}, is on the way.'
          : volunteer.asked == 0
          ? 'No volunteers free nearby.'
          : 'Asked ${volunteer.asked} ${volunteer.asked == 1 ? 'volunteer' : 'volunteers'} nearby. No answer yet.';
      add(
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            _Line(icon: Icons.volunteer_activism_outlined, title: 'Volunteers', detail: line),
            if (volunteer.going && name != null && phone != null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s12),
              CallButton(name: firstNameOf(name), phone: phone, canOpen: canOpen, open: open),
            ],
          ],
        ),
      );
    }

    if (controller.canTalk) {
      add(_Talk(controller: controller, alert: alert, startedBy: detail?.voice.startedBy));
    } else if (controller.talkIsOff) {
      // Said plainly, so nobody looks for a button that is not there.
      add(
        Text("Calls through the app aren't available right now.", style: theme.textTheme.bodySmall),
      );
    }

    if (parts.isEmpty) return const SizedBox.shrink();
    return Semantics(
      liveRegion: true,
      child: GroupCard(title: 'Now', children: parts),
    );
  }
}

/// One thing in a group: an icon, its name, and a line about it.
class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.title, required this.detail});

  final IconData icon;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(icon),
        const SizedBox(width: MzaziSpace.s12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: theme.textTheme.titleMedium),
              const SizedBox(height: MzaziSpace.s4),
              Text(detail, style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
      ],
    );
  }
}

/// What the elder said after pressing help, in their own words and, when they spoke
/// another language, in English under it. The latest on the page; every one on a page
/// of its own.
class _Said extends StatelessWidget {
  const _Said({required this.heard, required this.first, this.titled = true});

  final SpeechHeard heard;
  final String first;
  final bool titled;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String time = '${heard.at.hour}:${heard.at.minute.toString().padLeft(2, '0')}';
    return GroupCard(
      title: titled ? 'What $first said' : null,
      top: titled ? MzaziSpace.s24 : MzaziSpace.s12,
      children: <Widget>[
        Text('\u201c${heard.transcript}\u201d', style: theme.textTheme.bodyLarge),
        if (heard.english case final String english) ...<Widget>[
          const SizedBox(height: MzaziSpace.s4),
          Text('In English: $english', style: theme.textTheme.bodyMedium),
        ],
        const SizedBox(height: MzaziSpace.s4),
        Text(
          heard.heardType == null ? time : '$time · Heard: ${heard.heardType!.label.toLowerCase()}',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

/// When the elder's history makes this emergency more serious than it looks: said near
/// the top, on the amber of an emergency waiting on a person, with why and the service to
/// ask. Never red: it informs, and a helper decides.
class _MedicalWarning extends StatelessWidget {
  const _MedicalWarning({required this.controller, required this.medical, required this.first});

  final AlertDetailController controller;
  final AlertMedical medical;
  final String first;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool dark = theme.brightness == Brightness.dark;
    final Color wash = dark ? MzaziColorsDark.callBg : MzaziColorsLight.callBg;
    final Color amber = dark ? MzaziColorsDark.callFg : MzaziColorsLight.callFg;
    final ResponderService? askFor = controller.medicalAskFor;

    return GroupCard(
      colour: wash,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(Icons.warning_amber_rounded, color: amber),
            const SizedBox(width: MzaziSpace.s8),
            Expanded(
              child: Text(
                "$first's health makes this more serious.",
                style: theme.textTheme.titleMedium,
              ),
            ),
          ],
        ),
        for (final MedicalHighlight item in medical.highlights.where(
          (MedicalHighlight h) => h.serious,
        )) ...<Widget>[
          const SizedBox(height: MzaziSpace.s12),
          Text(item.label, style: theme.textTheme.titleSmall),
          if (item.why case final String why) Text(why, style: theme.textTheme.bodyMedium),
        ],
        if (askFor != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s16),
          FilledButton.icon(
            style: CallStyle.strong(context),
            onPressed: controller.isWorking
                ? null
                : () => unawaited(controller.requestResponder(askFor)),
            icon: Icon(serviceIcon(askFor)),
            label: Text(askFor.ask),
          ),
        ],
      ],
    );
  }
}

/// The medical details, briefly: age and blood type, what else matters for this
/// emergency, allergies; the whole record a tap away. Or why there is none to show.
class _MedicalSummary extends StatelessWidget {
  const _MedicalSummary({required this.medical, required this.first, required this.onAll});

  final AlertMedical medical;
  final String first;
  final VoidCallback onAll;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? line = switch (medical.status) {
      AlertMedicalStatus.none => 'No medical details saved.',
      AlertMedicalStatus.notShared => "$first hasn't agreed to share medical details.",
      AlertMedicalStatus.notAsked => "You'll see medical details once we ask you to help.",
      _ => null,
    };
    if (medical.status != AlertMedicalStatus.shown) {
      if (line == null) return const SizedBox.shrink();
      return GroupCard(
        title: 'Medical details',
        children: <Widget>[Text(line, style: theme.textTheme.bodyLarge)],
      );
    }

    final MedicalDetails details = medical.details ?? MedicalDetails.empty;
    final String? facts = ageAndBlood(medical.age, details.bloodType);
    // The serious ones are in the warning above.
    final List<MedicalHighlight> why = medical.highlights
        .where((MedicalHighlight h) => h.why != null && !h.serious)
        .toList();
    final List<String> also = medical.highlights
        .where((MedicalHighlight h) => h.why == null)
        .map((MedicalHighlight h) => h.label)
        .toList();
    final List<Widget> parts = <Widget>[
      if (facts != null) Text(facts, style: theme.textTheme.bodyLarge?.figures),
      for (final MedicalHighlight item in why)
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(item.label, style: theme.textTheme.titleSmall),
            Text(item.why!, style: theme.textTheme.bodyMedium),
          ],
        ),
      if (also.isNotEmpty) Text('Also: ${also.join(', ')}.', style: theme.textTheme.bodyMedium),
      if (details.allergies case final String allergies)
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Allergies', style: theme.textTheme.titleSmall),
            Text(allergies, style: theme.textTheme.bodyMedium),
          ],
        ),
    ];

    return GroupCard(
      title: 'Medical details',
      footer: '$first can see that you looked.',
      children: <Widget>[
        for (final (int index, Widget part) in parts.indexed) ...<Widget>[
          if (index > 0) const Divider(height: MzaziSpace.s24),
          part,
        ],
        if (parts.isNotEmpty) const SizedBox(height: MzaziSpace.s16),
        OutlinedButton.icon(
          onPressed: onAll,
          icon: const Icon(Icons.medical_information_outlined),
          label: const Text('All medical details'),
        ),
      ],
    );
  }
}

/// The whole medical record, on its own page: what each tick means here, medicines and
/// allergies, their doctor to call, and anything else to know.
class _MedicalRecord extends StatelessWidget {
  const _MedicalRecord({required this.medical, required this.elderName});

  final AlertMedical medical;
  final String elderName;

  @override
  Widget build(BuildContext context) {
    final MedicalDetails details = medical.details ?? MedicalDetails.empty;
    final bool dark = Theme.of(context).brightness == Brightness.dark;
    final Color amber = dark ? MzaziColorsDark.callFg : MzaziColorsLight.callFg;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        ProfileHeader(
          name: elderName,
          subtitle: ageAndBlood(medical.age, details.bloodType) ?? 'Age and blood type not added',
        ),
        if (medical.highlights.isNotEmpty || details.conditions != null)
          SettingsSection(
            title: 'Conditions and needs',
            children: <Widget>[
              for (final MedicalHighlight item in medical.highlights)
                SettingsRow(
                  icon: medicalFlagIcon(item.flag),
                  title: item.label,
                  subtitle: item.why,
                  chevron: false,
                ),
              if (details.conditions case final String text)
                SettingsFact(icon: Icons.notes, label: 'Other conditions', value: text),
            ],
          ),
        if (details.medications != null || details.allergies != null)
          SettingsSection(
            title: 'Medicines and allergies',
            children: <Widget>[
              if (details.medications case final String text)
                SettingsFact(icon: Icons.medication_outlined, label: 'Medicines', value: text),
              if (details.allergies case final String text)
                SettingsFact(icon: Icons.error_outline, label: 'Allergies', value: text),
            ],
          ),
        if (details.doctorName != null || details.doctorPhone != null || details.hospital != null)
          SettingsSection(
            title: 'Doctor',
            children: <Widget>[
              if (details.doctorName case final String name)
                SettingsFact(icon: Icons.person_outline, label: 'Doctor', value: name),
              if (details.doctorPhone case final String phone)
                SettingsRow(
                  icon: Icons.phone,
                  iconColour: amber,
                  chevron: false,
                  title: 'Call ${details.doctorName ?? 'their doctor'}',
                  subtitle: phone,
                  onTap: () => unawaited(
                    CallButton.dial(
                      context,
                      name: details.doctorName ?? 'their doctor',
                      phone: phone,
                    ),
                  ),
                ),
              if (details.hospital case final String hospital)
                SettingsFact(
                  icon: Icons.local_hospital_outlined,
                  label: 'Their hospital',
                  value: hospital,
                ),
            ],
          ),
        if (details.languages != null || details.notes != null)
          SettingsSection(
            title: 'Good to know',
            footer: '${firstNameOf(elderName)} can see that you looked.',
            children: <Widget>[
              if (details.languages case final String text)
                SettingsFact(icon: Icons.translate, label: 'Speaks', value: text),
              if (details.notes case final String text)
                SettingsFact(icon: Icons.info_outline, label: 'Notes', value: text),
            ],
          ),
      ],
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
