import 'package:flutter/foundation.dart';

/// A link that opens the phone's own messages app with the recipients and the words
/// already filled in, so asking for help by text is one press of send.
///
/// The app never sends a text itself. That would need the SMS permission, which Google
/// Play allows only for default messaging apps, and it would take the last word away from
/// the person holding the phone.
///
/// Android and iOS read these links differently, which is why the platform matters:
///
/// * Android takes the numbers comma-separated in the path and the words as `?body=`.
/// * iOS takes one number with the words as `&body=`, and several numbers only through
///   its `/open?addresses=` form.
///
/// Spaces are encoded as `%20`, never `+`: some messages apps show a `+` literally.
Uri smsLink(List<String> to, String body, {TargetPlatform? platform}) {
  final TargetPlatform target = platform ?? defaultTargetPlatform;
  final String numbers = to.map((String number) => number.replaceAll(' ', '')).join(',');
  final String words = Uri.encodeComponent(body);

  if (target == TargetPlatform.iOS) {
    return to.length > 1
        ? Uri.parse('sms:/open?addresses=$numbers&body=$words')
        : Uri.parse('sms:$numbers&body=$words');
  }
  return Uri.parse('sms:$numbers?body=$words');
}
