import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../theme/theme.dart';
import 'motion.dart';

/// Where an emergency has got to, as a row of steps.
///
/// Built for the elder first: told, coming, arrived, closed. A person who has pressed
/// for help wants one answer, "is anything happening", and a stepper answers it at a
/// glance without reading a sentence. The words stay under each step, because a dot on
/// its own means nothing to somebody who has never seen this screen before.
///
/// Screen readers hear one sentence, "Step 2 of 4, Someone is coming", rather than four
/// separate labels with no indication of which one is current.
class ProgressStepper extends StatelessWidget {
  const ProgressStepper({required this.steps, required this.current, super.key});

  final List<String> steps;

  /// The step reached, counted from zero. Everything before it is done.
  final int current;

  @override
  Widget build(BuildContext context) {
    assert(steps.length > 1, 'a single step is not progress');
    assert(current >= 0 && current < steps.length, 'current must name one of the steps');
    final ThemeData theme = Theme.of(context);
    final Duration move = Motion.of(context, MzaziMotion.standard);
    final Color done = theme.colorScheme.primary;
    final Color waiting = theme.colorScheme.outlineVariant;

    return Semantics(
      container: true,
      label: 'Step ${current + 1} of ${steps.length}, ${steps[current]}',
      child: ExcludeSemantics(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            for (int i = 0; i < steps.length; i += 1)
              Expanded(
                child: Column(
                  children: <Widget>[
                    // One height for every column's track, whatever the size of its dot.
                    // Without it the current, larger dot made its column taller than the
                    // rest, so the connecting line sat higher there and the bar looked
                    // broken at every step.
                    SizedBox(
                      height: MzaziSpace.s24,
                      child: Row(
                        children: <Widget>[
                          Expanded(
                            child: i == 0
                                ? const SizedBox.shrink()
                                : AnimatedContainer(
                                    duration: move,
                                    curve: MzaziEasing.standard,
                                    height: MzaziStroke.rule,
                                    color: i <= current ? done : waiting,
                                  ),
                          ),
                          AnimatedContainer(
                            duration: move,
                            curve: MzaziEasing.standard,
                            width: i == current ? MzaziSpace.s24 : MzaziSpace.s16,
                            height: i == current ? MzaziSpace.s24 : MzaziSpace.s16,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: i <= current ? done : theme.colorScheme.surface,
                              border: Border.all(
                                color: i <= current ? done : waiting,
                                width: MzaziStroke.focus,
                              ),
                            ),
                          ),
                          Expanded(
                            child: i == steps.length - 1
                                ? const SizedBox.shrink()
                                : AnimatedContainer(
                                    duration: move,
                                    curve: MzaziEasing.standard,
                                    height: MzaziStroke.rule,
                                    color: i < current ? done : waiting,
                                  ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: MzaziSpace.s8),
                    // One line, never broken inside a word. At the elder's size a word
                    // like "Coming" can be wider than its share of a small phone, and
                    // Flutter then breaks it letter by letter. Scaling down only ever
                    // happens at the largest system text sizes; the words read the same.
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s4),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          steps[i],
                          maxLines: 1,
                          softWrap: false,
                          // weighted rather than copyWith(fontWeight:), which leaves a
                          // variable font's weight axis where it was.
                          style:
                              (i == current
                                      ? theme.textTheme.bodyMedium?.weighted(MzaziWeight.heading)
                                      : theme.textTheme.bodyMedium)
                                  ?.copyWith(
                                    color: i <= current
                                        ? theme.colorScheme.onSurface
                                        : theme.colorScheme.onSurfaceVariant,
                                  ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
