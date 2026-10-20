/// A country a phone number can belong to.
class Country {
  const Country(this.iso, this.name, this.dial, this.trunk, this.minLength, this.maxLength);

  /// ISO 3166 code, for example KE.
  final String iso;
  final String name;

  /// The calling code without the plus, for example 254.
  final String dial;

  /// What people type before a local number and drop when dialling from abroad: the 0
  /// in 0712 345 678. Empty where there is none, as in Italy, whose leading 0 stays.
  final String trunk;

  /// The shortest and longest national number, without the trunk prefix.
  final int minLength;
  final int maxLength;

  /// The flag, made from the two regional-indicator letters of the ISO code. It needs
  /// no images and every phone draws it.
  String get flag =>
      String.fromCharCodes(iso.toUpperCase().codeUnits.map((int unit) => 0x1F1E6 + unit - 0x41));
}
