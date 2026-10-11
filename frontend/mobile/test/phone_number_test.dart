import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/phone/countries.dart';
import 'package:mzazicare/core/phone/country.dart';
import 'package:mzazicare/core/phone/phone_number.dart';

Country byIso(String iso) => countries.firstWhere((Country c) => c.iso == iso);

void main() {
  group('reading a Kenyan number', () {
    final Country kenya = byIso('KE');

    for (final String typed in <String>[
      '0712345678',
      '712345678',
      '0712 345 678',
      '0712-345-678',
      '(0712) 345678',
      '+254712345678',
      '+254 712 345 678',
      '00254712345678',
    ]) {
      test('"$typed" becomes +254712345678', () {
        expect(readPhone(kenya, typed).e164, '+254712345678');
      });
    }

    test('an empty field asks for a number', () {
      expect(readPhone(kenya, '  ').problem, 'Enter a phone number.');
    });

    test('a number too short for the country says so, naming it', () {
      expect(readPhone(kenya, '0712').problem, 'That number is too short for Kenya.');
    });
  });

  test('a country with no trunk prefix keeps its leading zero', () {
    // Italian landlines keep the 0 even when dialled from abroad.
    expect(readPhone(byIso('IT'), '0612345678').e164, '+390612345678');
  });

  test('the United States drops a leading 1 typed out of habit', () {
    final Country us = byIso('US');
    expect(readPhone(us, '1 (202) 555-0143').e164, '+12025550143');
    expect(readPhone(us, '202 555 0143').e164, '+12025550143');
  });

  test('a number typed with its own plus is taken as given, whatever country is chosen', () {
    expect(readPhone(byIso('US'), '+256712345678').e164, '+256712345678');
  });

  test('Kenya is chosen to begin with', () {
    expect(defaultCountry.iso, 'KE');
    expect(defaultCountry.dial, '254');
  });

  test('every country has a calling code, a name and a flag', () {
    expect(countries.length, greaterThan(200));
    for (final Country c in countries) {
      expect(c.dial, matches(RegExp(r'^[1-9]\d{0,3}$')), reason: c.iso);
      expect(c.name, isNotEmpty, reason: c.iso);
      expect(c.flag.runes.length, 2, reason: c.iso);
    }
  });
}
