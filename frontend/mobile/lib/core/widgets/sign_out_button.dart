import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// Signing out, the same way everywhere.
///
/// There were three treatments before this: an icon button in the caregiver's app bar, a
/// small text button on the elder's screen, and an outlined button on the administrator
/// notice. Three controls for one action is the kind of inconsistency that makes an
/// interface feel unfinished even when every screen is individually fine.
///
/// One component, and the audience only changes its size. The elder's copy is bigger
/// because every target on that screen is, not because it is a different control.
class SignOutButton extends StatelessWidget {
  const SignOutButton({required this.onPressed, this.minSize, super.key});

  final VoidCallback onPressed;

  /// The floor for the tappable area. Defaults to the standard minimum; pass the elder
  /// minimum on an elder screen.
  final double? minSize;

  @override
  Widget build(BuildContext context) {
    final double size = minSize ?? MzaziA11y.standardMinTouchTarget;

    return IconButton(
      onPressed: onPressed,
      // The name is on the icon rather than left to the tooltip. A tooltip is a pointer
      // affordance and whether it reaches the semantics tree is Flutter's business, not
      // something an accessibility guarantee should rest on; an icon's semanticLabel is
      // the accessible name by definition. Both are set, because they serve two different
      // people: somebody hovering, and somebody who cannot see the icon at all.
      icon: const Icon(Icons.logout, semanticLabel: 'Sign out'),
      tooltip: 'Sign out',
      constraints: BoxConstraints(minWidth: size, minHeight: size),
      iconSize: size / 2.4,
    );
  }
}
