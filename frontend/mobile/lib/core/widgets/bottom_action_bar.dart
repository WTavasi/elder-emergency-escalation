import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../theme/theme.dart';

/// The actions a screen exists for, at the bottom where a thumb reaches them.
///
/// Phones are held in one hand, and the top of a modern screen is out of reach of the
/// thumb holding it. So the decision a screen asks for (respond, call, close) sits here,
/// full width, above the system gesture area, and the top of the screen is left for
/// reading. The first action is the primary one; any others follow beneath it.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({required this.children, this.elder = false, super.key});

  final List<Widget> children;

  /// The elder's touch target rather than the standard one.
  final bool elder;

  @override
  Widget build(BuildContext context) {
    assert(children.isNotEmpty, 'a bar with no actions should not be built');
    final ThemeData theme = Theme.of(context);
    final double target = elder ? MzaziA11y.elderMinTouchTarget : MzaziSizes.of(context).target;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(color: theme.colorScheme.outlineVariant, width: MzaziStroke.hairline),
        ),
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(
          MzaziSpace.s16,
          MzaziSpace.s12,
          MzaziSpace.s16,
          MzaziSpace.s12,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            for (int i = 0; i < children.length; i += 1) ...<Widget>[
              if (i > 0) const SizedBox(height: MzaziSpace.s8),
              ConstrainedBox(
                constraints: BoxConstraints(minHeight: target),
                child: children[i],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
