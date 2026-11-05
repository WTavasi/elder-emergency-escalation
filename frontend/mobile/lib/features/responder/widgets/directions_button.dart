import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/widgets/action_sheet.dart';
import 'call_button.dart' show Open;

/// Opens spoken, turn-by-turn directions to where the elder is, in a maps app.
///
/// The app's own map shows where everybody is; driving there is the maps app's job,
/// which it does far better. A Google Maps directions link opens the Google Maps app
/// when one is installed and the browser when not. On an iPhone the person chooses
/// between Apple Maps, which every iPhone has, and Google Maps. No map SDK and no key.
///
/// The place is the one the server attached to the alert, which is the elder's home or
/// a stay their circle recorded, never the elder's phone, so nothing here tracks anyone.
class DirectionsButton extends StatelessWidget {
  const DirectionsButton({
    required this.latitude,
    required this.longitude,
    this.addressLabel,
    this.open,
    super.key,
  });

  final double latitude;
  final double longitude;
  final String? addressLabel;

  /// Null means the real device. Tests pass their own to see the link without a phone.
  final Open? open;

  /// The documented cross-platform form of a Google Maps directions link.
  Uri get uri => Uri.https('www.google.com', '/maps/dir/', <String, String>{
    'api': '1',
    'destination': '$latitude,$longitude',
  });

  /// Apple Maps' documented directions link: driving, from where the phone is.
  Uri get appleUri => Uri.https('maps.apple.com', '/', <String, String>{
    'daddr': '$latitude,$longitude',
    'dirflg': 'd',
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: () => _go(context),
      icon: const Icon(Icons.directions),
      label: const Text('Get directions'),
    );
  }

  Future<void> _go(BuildContext context) async {
    final Open go = open ?? (Uri link) => launchUrl(link, mode: LaunchMode.externalApplication);

    Uri link = uri;
    if (Theme.of(context).platform == TargetPlatform.iOS) {
      final Uri? chosen = await showActionSheet<Uri>(
        context,
        title: 'Get directions',
        actions: <SheetAction<Uri>>[
          SheetAction<Uri>('Apple Maps', appleUri, icon: Icons.map_outlined, primary: true),
          SheetAction<Uri>('Google Maps', uri, icon: Icons.directions),
        ],
      );
      if (chosen == null) return;
      link = chosen;
    }
    if (!context.mounted) return;

    try {
      if (await go(link)) return;
    } on Exception {
      // Falls through: a phone with no browser and no maps app is rare, but a button
      // that silently does nothing would be worse than saying so.
    }

    if (!context.mounted) return;
    await showActionSheet<void>(
      context,
      title: 'Get directions',
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text("Couldn't open maps. Search for this place:"),
          const SizedBox(height: MzaziSpace.s12),
          SelectableText(
            addressLabel ?? '$latitude, $longitude',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ],
      ),
      actions: const <SheetAction<void>>[SheetAction<void>('Close', null, icon: Icons.close)],
    );
  }
}
