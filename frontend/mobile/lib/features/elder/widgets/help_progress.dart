import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/api/models.dart';
import '../../../core/location/journey_words.dart';
import '../../../core/widgets/progress_stepper.dart';

/// What the elder sees once help has been asked for and can no longer be withdrawn.
///
/// Told, coming, here: a stepper that moves as it happens, the name of whoever took it
/// on, and while they are on their way, how long they will be. Never where they are.
/// The elder's copy of the emergency has no position in it, and a map is something to
/// read, not something to wait with.
class HelpProgress extends StatelessWidget {
  const HelpProgress({required this.emergency, super.key});

  /// The emergency as the elder's copy has it. Null only for the instant between the
  /// countdown ending and the first answer, which reads as "told".
  final Emergency? emergency;

  /// Told, coming, here: the three things an elder waiting for help wants to know, in
  /// the order they happen. There is no "done" step, because a closed emergency moves
  /// the elder to its own screen and a fourth dot here could never light up. Three also
  /// leaves each word a third of the width, which the elder's type size needs.
  static const List<String> _steps = <String>['Told', 'Coming', 'Here'];

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? owner = emergency?.acknowledgedByName;
    final bool arrived = emergency?.hasArrived ?? false;
    final Journey? journey = emergency?.journey;

    final int step = arrived ? 2 : (owner != null ? 1 : 0);
    final String headline = switch (step) {
      2 => '${owner ?? 'Help'} is with you',
      1 => '$owner is coming',
      _ => 'Help is on the way',
    };
    // The time only, while they are on their way.
    final String? when = step == 1 && journey != null
        ? '${_capitalised(minutesAway(journey.etaSeconds))} away.'
        : null;
    final String detail = switch (step) {
      2 => 'Help has reached you.',
      1 => 'Stay where you are if you can.',
      _ => 'The people who look after you have been told. Waiting for someone to answer.',
    };

    return Semantics(
      liveRegion: true,
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
          Text(detail, style: theme.textTheme.bodyLarge),
          const Spacer(),
          Text(
            arrived
                ? 'You do not need to do anything else.'
                : 'Someone will call you. You do not need to do anything else.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  static String _capitalised(String text) =>
      text.isEmpty ? text : '${text[0].toUpperCase()}${text.substring(1)}';
}
