import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:url_launcher/url_launcher.dart';

/// Whether this device can open a link, and opening it. Split out so a test can see what
/// would have been dialled without a phone, and so a simulator's answer can be faked.
typedef CanOpen = Future<bool> Function(Uri uri);
typedef Open = Future<bool> Function(Uri uri);

/// Rings somebody, using the phone's own dialler.
///
/// Nothing is dialled automatically. Android opens its dialler with the number filled
/// in and iOS asks for confirmation, so the person holding the phone always makes the
/// final press, and the app never needs permission to place calls.
///
/// A device that cannot place calls is normal rather than an error: a simulator, a
/// Wi-Fi-only tablet, a phone with no SIM. A button that silently does nothing there is
/// the worst outcome, because the person tries again and then loses faith in every
/// other button too. So when the device says no, the number is shown to dial by hand.
class CallButton extends StatelessWidget {
  const CallButton({
    required this.name,
    required this.phone,
    this.canOpen,
    this.open,
    this.stacked = false,
    super.key,
  });

  final String name;
  final String phone;

  /// The icon above the label, for a button sharing a row with another, so the pair
  /// lines up whatever each one's wording.
  final bool stacked;

  /// Null means the real device. Tests pass their own to see what would be dialled.
  final CanOpen? canOpen;
  final Open? open;

  /// First name only. "Call Grace" is what a person would say; the surname adds width
  /// to a button that sits beside another one.
  String get _firstName {
    final String trimmed = name.trim();
    return trimmed.isEmpty ? 'them' : trimmed.split(RegExp(r'\s+')).first;
  }

  @override
  Widget build(BuildContext context) {
    // The icon is what separates this from "Call an emergency responder", which sends
    // the emergency on through the system rather than ringing anybody.
    final ButtonStyle style = CallStyle.soft(context);
    if (stacked) {
      return OutlinedButton(
        style: style.merge(StackedLabel.padding),
        onPressed: () => _call(context),
        child: StackedLabel(icon: Icons.phone, label: 'Call $_firstName'),
      );
    }
    return OutlinedButton.icon(
      style: style,
      onPressed: () => _call(context),
      icon: const Icon(Icons.phone),
      label: Text('Call $_firstName'),
    );
  }

  Future<void> _call(BuildContext context) async {
    final Uri uri = Uri(scheme: 'tel', path: phone);

    final CanOpen check = canOpen ?? canLaunchUrl;
    final Open go = open ?? launchUrl;

    try {
      if (await check(uri) && await go(uri)) return;
    } on Exception {
      // Falls through to the manual route below. A dialler that throws is the same, to
      // the person holding the phone, as one that does not exist.
    }

    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text('Call $_firstName'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text('This device cannot place calls. Dial this number from a phone:'),
            const SizedBox(height: MzaziSpace.s12),
            // Selectable, so it can be copied into another app rather than retyped.
            SelectableText(
              phone,
              style: Theme.of(dialogContext).textTheme.titleLarge
                  ?.copyWith(fontFamily: MzaziFont.mono),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

/// Amber for the buttons that reach a person: the design language's colour for an
/// emergency waiting on somebody, never the red kept for the emergency itself.
///
/// Soft for ringing somebody, solid for calling in a responder, which is the bigger step.
/// Both from tokens, so the contrast gate checks them with every other pair.
abstract final class CallStyle {
  static bool _dark(BuildContext context) => Theme.of(context).brightness == Brightness.dark;

  static ButtonStyle soft(BuildContext context) {
    final bool dark = _dark(context);
    return OutlinedButton.styleFrom(
      backgroundColor: dark ? MzaziColorsDark.callBg : MzaziColorsLight.callBg,
      foregroundColor: dark ? MzaziColorsDark.callFg : MzaziColorsLight.callFg,
      side: BorderSide(color: dark ? MzaziColorsDark.callBd : MzaziColorsLight.callBd),
    );
  }

  static ButtonStyle strong(BuildContext context) {
    final bool dark = _dark(context);
    return FilledButton.styleFrom(
      backgroundColor: dark ? MzaziColorsDark.callStrongBg : MzaziColorsLight.callStrongBg,
      foregroundColor: dark ? MzaziColorsDark.callStrongFg : MzaziColorsLight.callStrongFg,
    );
  }
}

/// An icon above a centred label. Two of these side by side are the same shape whether
/// one label is two words or five, which is what keeps a row of them even.
class StackedLabel extends StatelessWidget {
  const StackedLabel({required this.icon, required this.label, super.key});

  final IconData icon;
  final String label;

  /// Even padding for a stacked button, top and bottom as well as the sides.
  static const ButtonStyle padding = ButtonStyle(
    padding: WidgetStatePropertyAll<EdgeInsetsGeometry>(
      EdgeInsets.symmetric(vertical: MzaziSpace.s12, horizontal: MzaziSpace.s8),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon),
        const SizedBox(height: MzaziSpace.s4),
        Text(label, textAlign: TextAlign.center),
      ],
    );
  }
}
