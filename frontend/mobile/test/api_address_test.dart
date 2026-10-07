import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/main.dart';

void main() {
  test('the Android emulator reaches the Mac at 10.0.2.2 by default', () {
    expect(
      resolveApiBaseUrl(configured: '', platform: TargetPlatform.android),
      'http://10.0.2.2:3000/api/v1',
    );
  });

  test('the iOS Simulator reaches the Mac at localhost by default', () {
    // This was 10.0.2.2 as well, which leads nowhere on iOS, so sign in timed out.
    expect(
      resolveApiBaseUrl(configured: '', platform: TargetPlatform.iOS),
      'http://localhost:3000/api/v1',
    );
  });

  test('an address given at build time always wins', () {
    expect(
      resolveApiBaseUrl(
        configured: 'http://192.168.1.20:3000/api/v1',
        platform: TargetPlatform.android,
      ),
      'http://192.168.1.20:3000/api/v1',
    );
  });
}
