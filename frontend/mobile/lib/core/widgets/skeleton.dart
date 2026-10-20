import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import 'motion.dart';

/// A placeholder in the shape of what is loading.
///
/// A spinner says "wait"; a skeleton says what is coming and where, so the screen does
/// not jump when it arrives. It pulses gently, or holds still under Reduce Motion, and
/// is hidden from screen readers, which are told by the screen that it is loading.
class Skeleton extends StatefulWidget {
  const Skeleton({
    this.width,
    this.height = MzaziSpace.s16,
    this.radius = MzaziRadius.input,
    super.key,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (Motion.reduced(context)) {
      _pulse
        ..stop()
        ..value = 0.5;
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final Color base = Theme.of(context).colorScheme.surfaceContainerHighest;

    return ExcludeSemantics(
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.45, end: 0.9).animate(_pulse),
        child: Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: base,
            borderRadius: BorderRadius.circular(widget.radius),
          ),
        ),
      ),
    );
  }
}
