import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/api/models.dart';
import '../../../core/location/journey_words.dart';
import '../../../core/widgets/action_sheet.dart';
import '../../../core/widgets/emergency_type_icon.dart';
import '../../../core/widgets/progress_stepper.dart';

/// What the elder sees once help has been asked for and can no longer be withdrawn.
///
/// Told, coming, here: a stepper that moves as it happens, the name of whoever took it
/// on, and while they are on their way, how long they will be. Never where they are.
/// The elder's copy of the emergency has no position in it, and a map is something to
/// read, not something to wait with.
class HelpProgress extends StatelessWidget {
  const HelpProgress({
    required this.emergency,
    this.compact = false,
    this.onReport,
    this.reporting = false,
    this.onSpeak,
    this.heard,
    this.listening = false,
    super.key,
  });

  /// Listens to the elder say what is happening. Null when speaking is not offered: no
  /// speech server, or no consent.
  final Future<void> Function()? onSpeak;

  /// What they last said, as written down.
  final SpeechHeard? heard;

  /// What they said is being written down.
  final bool listening;

  /// Says what is happening. Null where the screen is shown without an API, as in a test
  /// of the steps alone, and then the button is not offered.
  final Future<void> Function(EmergencyType type)? onReport;

  /// A report is on its way.
  final bool reporting;

  /// The emergency as the elder's copy has it. Null only for the instant between the
  /// countdown ending and the first answer, which reads as "told".
  final Emergency? emergency;

  /// Just the headline, the steps and the time, for when a call takes the space above.
  final bool compact;

  /// Told, coming, here: the three things an elder waiting for help wants to know, in
  /// the order they happen. There is no "done" step, because a closed emergency moves
  /// the elder to its own screen and a fourth dot here could never light up. Three also
  /// leaves each word a third of the width, which the elder's type size needs.
  static const List<String> _steps = <String>['Sent', 'Coming', 'Here'];

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? owner = emergency?.acknowledgedByName;
    final VolunteerOnAlert? volunteer = emergency?.volunteer;
    final String? helperVolunteer = (volunteer?.going ?? false) ? volunteer?.name : null;
    final bool arrived =
        (emergency?.hasArrived ?? false) || (owner == null && (volunteer?.hasArrived ?? false));

    // Somebody from the family first; a volunteer from nearby when nobody from the family
    // has said yet. Either way the elder is told the one person coming, by name.
    final String? coming = owner ?? helperVolunteer;
    // The time of the one person the headline names: the volunteer's own when they are
    // the one coming, and the family member's otherwise.
    final Journey? journey = owner != null ? emergency?.journey : emergency?.volunteerJourney;

    final int step = arrived ? 2 : (coming != null ? 1 : 0);
    final String headline = switch (step) {
      2 => '${coming ?? 'Help'} is with you',
      1 => '$coming is coming',
      _ => "We've told your family",
    };
    // Who the volunteer is, said once: in place of a family name when they are the one
    // coming, and as well as it when both are.
    final String? volunteerLine = helperVolunteer == null
        ? null
        : owner == null
        ? "$helperVolunteer is a volunteer who lives near you. We've told your family too."
        : '$helperVolunteer, a volunteer near you, is ${(volunteer?.hasArrived ?? false) ? 'also with you' : 'also coming'}.';
    // The time only, while they are on their way: from their way there when they share
    // it, or from what they said by text ("nakuja dakika kumi").
    final DateTime? expected = owner != null ? emergency?.ownerExpectedAt : null;
    final int? saidSeconds = expected?.difference(DateTime.now()).inSeconds;
    final String? when = step != 1
        ? null
        : journey != null
        ? '${_capitalised(timeAway(journey.etaSeconds))} away.'
        : saidSeconds == null
        ? null
        : saidSeconds > 60
        ? '${_capitalised(timeAway(saidSeconds))} away.'
        : 'Should be with you any minute.';
    // Nothing under the headline once somebody is with them: it would only repeat it.
    final String? detail = switch (step) {
      2 => null,
      1 => "Stay where you are if it's safe.",
      _ => 'Waiting for someone to answer.',
    };

    return Semantics(
      liveRegion: true,
      // Scrolls only when it must: on the smallest phones at the elder size, with a
      // volunteer, a time and what was said, it is taller than the room it has.
      // Otherwise it fills the room, and what is at the bottom stays at the bottom.
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text(headline, style: theme.textTheme.headlineLarge),
                  const SizedBox(height: MzaziSpace.s24),
                  // Moving along as it happens, the way a delivery is tracked, so the elder can
                  // see it moving without reading a sentence closely and without pressing
                  // anything.
                  ProgressStepper(steps: _steps, current: step),
                  const SizedBox(height: MzaziSpace.s32),
                  if (volunteerLine != null) ...<Widget>[
                    Text(volunteerLine, style: theme.textTheme.bodyLarge),
                    const SizedBox(height: MzaziSpace.s12),
                  ],
                  if (when != null) ...<Widget>[
                    // The one number on this screen, set large with figures of equal width so a
                    // changing minute does not shift the words around it.
                    Text(
                      when,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: MzaziSpace.s12),
                  ],
                  if (!compact) ...<Widget>[
                    if (detail != null) Text(detail, style: theme.textTheme.bodyLarge),
                    if (onReport != null && !arrived) ...<Widget>[
                      const SizedBox(height: MzaziSpace.s24),
                      WhatsHappening(
                        reported: emergency?.reportedType,
                        busy: reporting || listening,
                        onReport: onReport!,
                        onSpeak: onSpeak,
                        heard: heard,
                        listening: listening,
                      ),
                    ],
                    const Spacer(),
                    Text(
                      arrived
                          ? "That's all you need to do."
                          : "Keep your phone near you. That's all you need to do.",
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  static String _capitalised(String text) =>
      text.isEmpty ? text : '${text[0].toUpperCase()}${text.substring(1)}';
}

/// "Say what's happening", after the alert has gone, never before it.
///
/// One large button that opens a sheet of five rows, each a picture and a few words,
/// rather than five buttons on this screen, which at the elder's size would push the
/// rest of it off a small phone. Once said, it shows what the family can see, and for a
/// fire or danger, the one thing to do while help comes. The service is asked a few
/// seconds later, so a mistaken tap can be changed with Change first.
class WhatsHappening extends StatelessWidget {
  const WhatsHappening({
    required this.reported,
    required this.busy,
    required this.onReport,
    this.onSpeak,
    this.heard,
    this.listening = false,
    super.key,
  });

  final EmergencyType? reported;
  final bool busy;
  final Future<void> Function(EmergencyType type) onReport;

  /// Saying it out loud instead, when it is offered.
  final Future<void> Function()? onSpeak;
  final SpeechHeard? heard;
  final bool listening;

  /// "Say it out loud", or what it became once said.
  List<Widget> _spoken(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Future<void> Function()? speak = onSpeak;
    final String? words = heard?.transcript;
    return <Widget>[
      if (speak != null) ...<Widget>[
        const SizedBox(height: MzaziSpace.s8),
        OutlinedButton.icon(
          onPressed: busy ? null : () => unawaited(speak()),
          icon: const Icon(Icons.mic_none),
          label: Text(listening ? 'Writing it down…' : 'Say it out loud'),
        ),
      ],
      if (words != null && words.isNotEmpty) ...<Widget>[
        const SizedBox(height: MzaziSpace.s8),
        Text('You said: \u201c$words\u201d', style: theme.textTheme.bodyLarge),
      ] else if (heard != null) ...<Widget>[
        const SizedBox(height: MzaziSpace.s8),
        Text("We didn't hear anything. Try again, or tap.", style: theme.textTheme.bodyLarge),
      ],
    ];
  }

  Future<void> _ask(BuildContext context) async {
    final EmergencyType? chosen = await showActionSheet<EmergencyType?>(
      context,
      title: "What's happening?",
      message: 'Your family will see it.',
      actions: <SheetAction<EmergencyType?>>[
        for (final EmergencyType type in EmergencyType.values)
          SheetAction<EmergencyType?>(
            type.said,
            type,
            icon: emergencyTypeIcon(type),
            selected: type == reported,
          ),
        const SheetAction<EmergencyType?>('Go back', null, icon: Icons.close),
      ],
    );
    if (chosen != null && chosen != reported) await onReport(chosen);
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final EmergencyType? said = reported;

    if (said == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          OutlinedButton.icon(
            onPressed: busy ? null : () => _ask(context),
            icon: const Icon(Icons.campaign_outlined),
            label: Text(busy && !listening ? 'Sending…' : "Say what's happening"),
          ),
          ..._spoken(context),
        ],
      );
    }

    final String? advice = switch (said) {
      // Asked a few seconds after the tap, so a wrong one can be changed first.
      EmergencyType.fire => "Get out if you can. We're asking the fire service.",
      EmergencyType.unsafe => "Go somewhere safe if you can. We're asking the police.",
      EmergencyType.breathing => "We're asking for an ambulance.",
      _ => null,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Row(
          children: <Widget>[
            Icon(emergencyTypeIcon(said)),
            const SizedBox(width: MzaziSpace.s8),
            Expanded(
              child: Text('Your family can see: ${said.said}', style: theme.textTheme.bodyLarge),
            ),
          ],
        ),
        if (advice != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Text(advice, style: theme.textTheme.titleMedium),
        ],
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            onPressed: busy ? null : () => _ask(context),
            child: Text(busy && !listening ? 'Sending…' : 'Change'),
          ),
        ),
        ..._spoken(context),
      ],
    );
  }
}
