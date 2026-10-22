import 'package:flutter/widgets.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import 'motion.dart';

/// Swaps one block of controls for the next by fading and folding it away, rather than
/// letting it vanish between one frame and the next.
///
/// Used where an action changes what can be done next: a slider that has just been
/// swiped steps aside for what follows, so the person sees it complete instead of
/// wondering whether it was taken. Give [child] a key that changes with what it shows;
/// the same key keeps the block in place however often it rebuilds.
class FadeSwap extends StatelessWidget {
  const FadeSwap({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: Motion.of(context, MzaziMotion.escalation),
      reverseDuration: Motion.of(context, MzaziMotion.escalation),
      switchInCurve: MzaziEasing.decelerate,
      switchOutCurve: MzaziEasing.accelerate,
      transitionBuilder: (Widget child, Animation<double> animation) => FadeTransition(
        opacity: animation,
        child: SizeTransition(sizeFactor: animation, axisAlignment: -1, child: child),
      ),
      layoutBuilder: (Widget? current, List<Widget> previous) => Stack(
        alignment: Alignment.topCenter,
        // Keep the width the parent gives, so a left-aligned paragraph stays left.
        fit: StackFit.passthrough,
        children: <Widget>[...previous, ?current],
      ),
      child: child,
    );
  }
}
