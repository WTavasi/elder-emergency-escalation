import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import 'motion.dart';

/// A deliberate action that a pocket or a stray thumb cannot take.
///
/// For the few actions that are costly to take by mistake and are taken by people in a
/// hurry: closing an emergency, telling the chain "I am on my way". A tap is too easy
/// and a dialog is too slow. The thumb drags across the track; let go early and it
/// springs back.
///
/// A screen reader cannot swipe, so the control is also a button to assistive
/// technology: activating it confirms, and the label says what it does. Nothing about
/// the gesture is required to use the app.
class SwipeToConfirm extends StatefulWidget {
  const SwipeToConfirm({
    required this.label,
    required this.onConfirmed,
    this.enabled = true,
    this.elder = false,
    super.key,
  });

  /// What confirming does, written as the instruction: "Swipe to close the alert".
  final String label;
  final VoidCallback onConfirmed;
  final bool enabled;
  final bool elder;

  /// How far across counts as meant.
  static const double threshold = 0.85;

  /// How long the tick holds with nothing else to go on before the knob goes back. The
  /// usual end is sooner: the screen moves on and the slider fades away still ticked, or
  /// the request fails and the slider is enabled again.
  static const Duration holdTick = Duration(seconds: 4);

  @override
  State<SwipeToConfirm> createState() => _SwipeToConfirmState();
}

class _SwipeToConfirmState extends State<SwipeToConfirm> {
  double _progress = 0;
  bool _dragging = false;

  /// Swiped all the way: the knob shows a tick until it goes home, or the screen moves on.
  bool _done = false;
  Timer? _home;

  void _confirm() {
    if (!widget.enabled) return;
    unawaited(Haptics.confirm());
    widget.onConfirmed();
  }

  /// Back to the start in case the screen stays, so an action that failed can be taken
  /// again. Not straight away: going back while the request is still on its way would
  /// look like the swipe had not been taken, just before the slider fades out.
  void _returnHome() {
    _home?.cancel();
    _home = Timer(SwipeToConfirm.holdTick, _reset);
  }

  void _reset() {
    _home?.cancel();
    if (mounted && _done) {
      setState(() {
        _progress = 0;
        _done = false;
      });
    }
  }

  @override
  void didUpdateWidget(SwipeToConfirm oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Busy while the request ran, free again and still here: it did not take, so the
    // knob goes back now for another try.
    if (_done && !oldWidget.enabled && widget.enabled) _reset();
  }

  @override
  void dispose() {
    _home?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double height = widget.elder
        ? MzaziA11y.elderMinTouchTarget
        : MzaziA11y.standardMinTouchTarget + MzaziSpace.s8;
    // A ticked knob keeps its colour while the request runs, rather than greying out as
    // if the swipe had been refused.
    final Color fill = widget.enabled || _done
        ? theme.colorScheme.primary
        : theme.colorScheme.outline;

    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: widget.label,
      onTap: widget.enabled ? _confirm : null,
      excludeSemantics: true,
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          final double travel = (constraints.maxWidth - height).clamp(1, double.infinity);

          return GestureDetector(
            onHorizontalDragStart: widget.enabled ? (_) => setState(() => _dragging = true) : null,
            onHorizontalDragUpdate: widget.enabled
                ? (DragUpdateDetails details) => setState(
                    () => _progress = (_progress + details.delta.dx / travel).clamp(0, 1),
                  )
                : null,
            onHorizontalDragEnd: widget.enabled
                ? (_) {
                    final bool meant = _progress >= SwipeToConfirm.threshold;
                    setState(() {
                      _dragging = false;
                      _progress = meant ? 1 : 0;
                      _done = meant;
                    });
                    if (meant) {
                      _confirm();
                      _returnHome();
                    }
                  }
                : null,
            child: Container(
              height: height,
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(height / 2),
              ),
              child: Stack(
                alignment: Alignment.centerLeft,
                children: <Widget>[
                  Center(
                    child: Padding(
                      padding: EdgeInsets.only(left: height),
                      child: Text(
                        widget.label,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  AnimatedPositioned(
                    // Follows the finger exactly while dragging; springs home after.
                    duration: _dragging ? Duration.zero : Motion.of(context, MzaziMotion.standard),
                    curve: MzaziEasing.decelerate,
                    left: _progress * travel,
                    child: Container(
                      width: height,
                      height: height,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: fill),
                      child: AnimatedSwitcher(
                        duration: Motion.of(context, MzaziMotion.state),
                        child: Icon(
                          _done ? Icons.check : Icons.arrow_forward,
                          key: ValueKey<bool>(_done),
                          color: theme.colorScheme.onPrimary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
