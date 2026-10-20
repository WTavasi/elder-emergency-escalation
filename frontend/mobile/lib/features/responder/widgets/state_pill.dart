import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/api/models.dart';

/// The state of an emergency: a glyph and a word, in the state's ink.
///
/// It was a pill, a tinted capsule with a border. Three nested rounded shapes per row
/// of the alert list was most of what made the list look generated, and the capsule
/// added nothing the word and the colour do not already say. The name is kept because
/// it is what the rest of the code and the console call it.
///
/// Colour is never the only signal: every state carries a glyph and a word, because a
/// state a colour-blind reader cannot distinguish is decoration. The inks are the
/// foreground colours from the token file, each checked against the page by the gate;
/// "Waiting" uses the text-safe red rather than the pill's white-on-red.
class StatePill extends StatelessWidget {
  const StatePill({required this.state, super.key});

  final EventState state;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color ink = inkFor(state, theme);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        // No semantic label on the glyph. The word beside it already says the state, and
        // a screen reader announcing both would read every state twice.
        Icon(glyph(state), size: 18, color: ink),
        const SizedBox(width: MzaziSpace.s4),
        Text(label(state), style: theme.textTheme.labelLarge?.copyWith(color: ink)),
      ],
    );
  }

  /// The ink a state is written in, for anything else that wants to match it.
  static Color inkFor(EventState state, ThemeData theme) {
    final bool dark = theme.brightness == Brightness.dark;
    return switch (state) {
      // Nobody has answered, or it had to move on: the red that means a person is needed.
      EventState.triggered ||
      EventState.notified ||
      EventState.escalated => dark ? MzaziColorsDark.danger : MzaziColorsLight.danger,
      // Somebody has it, on the way or already there: the same reassuring ink.
      EventState.acknowledged || EventState.onScene =>
        dark ? MzaziColorsDark.pillAcknowledgedFg : MzaziColorsLight.pillAcknowledgedFg,
      EventState.resolved =>
        dark ? MzaziColorsDark.pillResolvedFg : MzaziColorsLight.pillResolvedFg,
      EventState.cancelled => theme.colorScheme.onSurfaceVariant,
    };
  }

  /// A shape for each state, so the pill still reads for somebody who cannot tell the
  /// colours apart, which the design language requires and this pill did not do until
  /// now. Each glyph matches the action that produces the state: "Being handled" shows
  /// the same running figure as the "I am on my way" button, and "Closed" the same tick
  /// as "Close this emergency", so the two teach each other.
  static IconData glyph(EventState state) => switch (state) {
    EventState.triggered => Icons.hourglass_top,
    EventState.notified => Icons.hourglass_top,
    EventState.acknowledged => Icons.directions_run,
    // A pin with a tick, the same mark as "I'm here".
    EventState.onScene => Icons.where_to_vote_outlined,
    EventState.escalated => Icons.arrow_upward,
    EventState.resolved => Icons.check_circle_outline,
    EventState.cancelled => Icons.undo,
  };

  /// Wording a person would use. 'Triggered' and 'Notified' are database words; what a
  /// caregiver needs to know is whether anybody has answered yet.
  static String label(EventState state) => switch (state) {
    EventState.triggered => 'Waiting',
    EventState.notified => 'Waiting',
    EventState.acknowledged => 'Being handled',
    EventState.onScene => 'Help arrived',
    EventState.escalated => 'Escalated',
    EventState.resolved => 'Closed',
    EventState.cancelled => 'Withdrawn',
  };
}

/// How long ago, in the shortest form that is still accurate.
String elapsedSince(DateTime moment, {DateTime? now}) {
  final Duration gap = (now ?? DateTime.now()).difference(moment);
  if (gap.inSeconds < 60) return 'just now';
  if (gap.inMinutes < 60) return '${gap.inMinutes} min ago';
  if (gap.inHours < 24) return '${gap.inHours} hr ago';
  return '${gap.inDays} d ago';
}
