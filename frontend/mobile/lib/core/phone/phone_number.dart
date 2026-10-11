import 'countries.dart';
import 'country.dart';

/// Kenya, which is where nearly everybody using this starts, so most people never
/// touch the country button.
final Country defaultCountry = countries.firstWhere((Country c) => c.iso == 'KE');

/// What the API accepts: a plus, a calling code and up to fifteen digits.
final RegExp _e164 = RegExp(r'^\+[1-9]\d{7,14}$');

/// The outcome of reading what somebody typed into a phone field.
class PhoneReading {
  const PhoneReading._(this.e164, this.problem);

  /// The number in international format, when it reads as one.
  final String? e164;

  /// Why it does not, in words for the person who typed it.
  final String? problem;

  bool get isValid => e164 != null;
}

/// Turns a number as people type it into international format.
///
/// All of these become +254712345678 with Kenya chosen: 0712 345 678, 712345678,
/// 0712-345-678, +254 712 345 678, and 00254712345678. A number typed with its own
/// plus or 00 is taken as given, whichever country is chosen, because the person has
/// already said where it is. Otherwise the trunk prefix is dropped, if the number has
/// one and is long enough to have been typed with it, and the calling code is added.
PhoneReading readPhone(Country country, String typed) {
  final String trimmed = typed.trim();
  if (trimmed.isEmpty) return const PhoneReading._(null, 'Enter a phone number.');

  final bool international = trimmed.startsWith('+') || trimmed.startsWith('00');
  String digits = trimmed.replaceAll(RegExp(r'\D'), '');

  if (international) {
    if (trimmed.startsWith('00')) digits = digits.substring(2);
    final String full = '+$digits';
    return _e164.hasMatch(full)
        ? PhoneReading._(full, null)
        : const PhoneReading._(null, 'That does not look like a full international number.');
  }

  if (country.trunk.isNotEmpty &&
      digits.startsWith(country.trunk) &&
      digits.length - country.trunk.length >= country.minLength) {
    digits = digits.substring(country.trunk.length);
  }

  if (digits.length < country.minLength) {
    return PhoneReading._(null, 'That number is too short for ${country.name}.');
  }
  if (digits.length > country.maxLength) {
    return PhoneReading._(null, 'That number is too long for ${country.name}.');
  }

  final String full = '+${country.dial}$digits';
  return _e164.hasMatch(full)
      ? PhoneReading._(full, null)
      : PhoneReading._(null, 'That does not look like a ${country.name} number.');
}
