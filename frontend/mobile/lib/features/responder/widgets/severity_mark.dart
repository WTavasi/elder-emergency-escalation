import 'package:flutter/material.dart';

import '../../../core/api/models.dart';

/// A severity band as a shape and a word.
///
/// The shapes follow Carbon's status-indicator pattern and match the console: an
/// octagon, a triangle and a dot are told apart by outline alone, so the band still
/// reads for somebody who cannot see the colour. The colour is the text colour, on
/// purpose: red is kept for an emergency nobody has answered, and a critical alert
/// somebody is already handling is not that.
class SeverityMark extends StatelessWidget {
  const SeverityMark({required this.severity, this.suffix = '', this.style, super.key});

  final Severity severity;

  /// Added after the word, for the places that say "Critical severity" in full.
  final String suffix;
  final TextStyle? style;

  static IconData glyph(Severity severity) => switch (severity) {
    Severity.critical => Icons.report,
    Severity.elevated => Icons.warning,
    Severity.standard => Icons.fiber_manual_record,
  };

  static String word(Severity severity) => switch (severity) {
    Severity.standard => 'Standard',
    Severity.elevated => 'Elevated',
    Severity.critical => 'Critical',
  };

  @override
  Widget build(BuildContext context) {
    final TextStyle? resolved = style ?? Theme.of(context).textTheme.labelLarge;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        // Unlabelled: the word beside it already says the band.
        Icon(glyph(severity), size: 18, color: resolved?.color),
        const SizedBox(width: 4),
        Text('${word(severity)}$suffix', style: resolved),
      ],
    );
  }
}
