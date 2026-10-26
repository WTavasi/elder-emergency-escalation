import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The top of a short flow's screen: which step it is, what it is for, and one line on
/// it. Signing up, signing in, setting a new password and an elder's code all open the
/// same way, so each reads like the others.
class StepHeading extends StatelessWidget {
  const StepHeading({required this.title, required this.lead, this.step, this.of = 2, super.key});

  final String title;
  final String lead;

  /// Which step this is, counted from one, or none for a screen that is not numbered.
  final int? step;
  final int of;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final int? step = this.step;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (step != null) ...<Widget>[
          Text(
            'STEP $step OF $of',
            style: theme.textTheme.labelSmall,
            semanticsLabel: 'Step $step of $of',
          ),
          const SizedBox(height: MzaziSpace.s8),
        ],
        Semantics(header: true, child: Text(title, style: theme.textTheme.headlineSmall)),
        const SizedBox(height: MzaziSpace.s8),
        Text(
          lead,
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}
