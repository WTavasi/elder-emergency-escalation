import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:url_launcher/url_launcher.dart';

import 'call_button.dart' show Open;

/// Opens directions to where the elder is, in whatever maps app the phone has.
///
/// A Google Maps directions link rather than an embedded map: it opens the Google Maps
/// app when one is installed and the browser when not, on Android and iOS alike, so
/// there is no map SDK, no API key and nothing extra to keep secure. The route, the
/// travel time and turn-by-turn navigation are all the maps app's job, which it does
/// better than this app could.
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

    try {
      if (await go(uri)) return;
    } on Exception {
      // Falls through: a phone with no browser and no maps app is rare, but a button
      // that silently does nothing would be worse than saying so.
    }

    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text('Get directions'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text('No maps app could be opened. Search for this place instead:'),
            const SizedBox(height: MzaziSpace.s12),
            SelectableText(
              addressLabel ?? '$latitude, $longitude',
              style: Theme.of(dialogContext).textTheme.titleMedium,
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
