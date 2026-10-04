import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/api/models.dart';

/// The state of an emergency, as a pill.
///
/// The three colours per state come from the same token file the console reads, so an
/// escalated emergency is the same red in both places. Colour is never the only signal:
/// every pill carries a glyph and a word, because a pill a colour-blind reader cannot
/// distinguish is decoration.
class StatePill extends StatelessWidget {
  const StatePill({required this.state, super.key});

  final EventState state;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool isDark = theme.brightness == Brightness.dark;
    final _PillColours colours = _coloursFor(state, isDark);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s12, vertical: MzaziSpace.s4),
      decoration: BoxDecoration(
        color: colours.background,
        border: Border.all(color: colours.border),
        borderRadius: BorderRadius.circular(MzaziRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          // No semantic label on the glyph. The word beside it already says the state, and
          // a screen reader announcing both would read every pill twice.
          Icon(glyph(state), size: 16, color: colours.foreground),
          const SizedBox(width: MzaziSpace.s4),
          Text(
            label(state),
            style: theme.textTheme.labelLarge?.copyWith(color: colours.foreground),
          ),
        ],
      ),
    );
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
    EventState.escalated => 'Escalated',
    EventState.resolved => 'Closed',
    EventState.cancelled => 'Withdrawn',
  };

  static _PillColours _coloursFor(EventState state, bool isDark) => switch (state) {
    EventState.triggered =>
      isDark
          ? const _PillColours(
              MzaziColorsDark.pillTriggeredBg,
              MzaziColorsDark.pillTriggeredFg,
              MzaziColorsDark.pillTriggeredBd,
            )
          : const _PillColours(
              MzaziColorsLight.pillTriggeredBg,
              MzaziColorsLight.pillTriggeredFg,
              MzaziColorsLight.pillTriggeredBd,
            ),
    EventState.notified =>
      isDark
          ? const _PillColours(
              MzaziColorsDark.pillNotifiedBg,
              MzaziColorsDark.pillNotifiedFg,
              MzaziColorsDark.pillNotifiedBd,
            )
          : const _PillColours(
              MzaziColorsLight.pillNotifiedBg,
              MzaziColorsLight.pillNotifiedFg,
              MzaziColorsLight.pillNotifiedBd,
            ),
    EventState.acknowledged =>
      isDark
          ? const _PillColours(
              MzaziColorsDark.pillAcknowledgedBg,
              MzaziColorsDark.pillAcknowledgedFg,
              MzaziColorsDark.pillAcknowledgedBd,
            )
          : const _PillColours(
              MzaziColorsLight.pillAcknowledgedBg,
              MzaziColorsLight.pillAcknowledgedFg,
              MzaziColorsLight.pillAcknowledgedBd,
            ),
    EventState.escalated =>
      isDark
          ? const _PillColours(
              MzaziColorsDark.pillEscalatedBg,
              MzaziColorsDark.pillEscalatedFg,
              MzaziColorsDark.pillEscalatedBd,
            )
          : const _PillColours(
              MzaziColorsLight.pillEscalatedBg,
              MzaziColorsLight.pillEscalatedFg,
              MzaziColorsLight.pillEscalatedBd,
            ),
    EventState.resolved =>
      isDark
          ? const _PillColours(
              MzaziColorsDark.pillResolvedBg,
              MzaziColorsDark.pillResolvedFg,
              MzaziColorsDark.pillResolvedBd,
            )
          : const _PillColours(
              MzaziColorsLight.pillResolvedBg,
              MzaziColorsLight.pillResolvedFg,
              MzaziColorsLight.pillResolvedBd,
            ),
    EventState.cancelled =>
      isDark
          ? const _PillColours(
              MzaziColorsDark.pillCancelledBg,
              MzaziColorsDark.pillCancelledFg,
              MzaziColorsDark.pillCancelledBd,
            )
          : const _PillColours(
              MzaziColorsLight.pillCancelledBg,
              MzaziColorsLight.pillCancelledFg,
              MzaziColorsLight.pillCancelledBd,
            ),
  };
}

class _PillColours {
  const _PillColours(this.background, this.foreground, this.border);

  final Color background;
  final Color foreground;
  final Color border;
}

/// How long ago, in the shortest form that is still accurate.
String elapsedSince(DateTime moment, {DateTime? now}) {
  final Duration gap = (now ?? DateTime.now()).difference(moment);
  if (gap.inSeconds < 60) return 'just now';
  if (gap.inMinutes < 60) return '${gap.inMinutes} min ago';
  if (gap.inHours < 24) return '${gap.inHours} hr ago';
  return '${gap.inDays} d ago';
}
