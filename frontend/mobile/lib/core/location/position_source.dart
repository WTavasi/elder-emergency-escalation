import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

/// One reading of where this phone is.
@immutable
class Fix {
  const Fix({required this.latitude, required this.longitude, this.accuracyMetres});

  final double latitude;
  final double longitude;

  /// How far off the reading may be. Null when the platform did not say.
  final double? accuracyMetres;
}

/// Whether this app may read where the phone is.
enum LocationAccess {
  granted,

  /// Refused this time. Asking again is allowed.
  denied,

  /// Refused for good. Only the phone's settings can change it now.
  deniedForever,

  /// Location is switched off for the whole phone.
  serviceOff,
}

/// Where the phone is, for the one feature that needs it.
///
/// A seam rather than the plugin called directly, so the sharing logic can be tested
/// without a phone, and so the rest of the app never imports a location package. The
/// elder's side of the app never reaches this: only a responder who turned on "Share
/// my way there" and took an emergency on is ever asked.
abstract class PositionSource {
  /// Whether access is granted, asking first when [ask] is true and asking is allowed.
  Future<LocationAccess> access({required bool ask});

  /// Readings while somebody listens. Stops when the subscription is cancelled.
  Stream<Fix> watch();

  /// The phone's settings, for an access that only they can change.
  Future<void> openSettings(LocationAccess access);
}

/// The real phone, through the geolocator plugin.
///
/// The stream keeps running with the app in the background, because the person sharing
/// is most likely following directions in a maps app. On Android that takes a
/// foreground service, which shows a notification for as long as it runs; on iOS it is
/// the location background mode, which shows the blue location indicator. Both are
/// visible on purpose: somebody whose position is being shared can always see that it
/// is, and both end the moment sharing stops. Only "while using the app" access is
/// asked for. Neither platform needs "always" for a stream that starts in the foreground.
class DevicePositionSource implements PositionSource {
  const DevicePositionSource();

  @override
  Future<LocationAccess> access({required bool ask}) async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceOff;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied && ask) {
      permission = await Geolocator.requestPermission();
    }

    return switch (permission) {
      LocationPermission.whileInUse || LocationPermission.always => LocationAccess.granted,
      LocationPermission.deniedForever => LocationAccess.deniedForever,
      LocationPermission.denied || LocationPermission.unableToDetermine => LocationAccess.denied,
    };
  }

  @override
  Stream<Fix> watch() => Geolocator.getPositionStream(locationSettings: _settings()).map(
    (Position position) => Fix(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMetres: position.accuracy > 0 ? position.accuracy : null,
    ),
  );

  @override
  Future<void> openSettings(LocationAccess access) async {
    if (access == LocationAccess.serviceOff) {
      await Geolocator.openLocationSettings();
    } else {
      await Geolocator.openAppSettings();
    }
  }

  /// Every reading the phone has, no distance filter: the app decides how often to
  /// send, and a filter would stop the readings altogether while stuck in traffic.
  static LocationSettings _settings() => switch (defaultTargetPlatform) {
    TargetPlatform.android => AndroidSettings(
      accuracy: LocationAccuracy.high,
      intervalDuration: const Duration(seconds: 10),
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationTitle: 'Sharing your way there',
        notificationText: 'MzaziCare stops sharing your location when you arrive.',
        notificationChannelName: 'Sharing your way there',
        setOngoing: true,
      ),
    ),
    TargetPlatform.iOS => AppleSettings(
      accuracy: LocationAccuracy.high,
      activityType: ActivityType.automotiveNavigation,
      pauseLocationUpdatesAutomatically: false,
      showBackgroundLocationIndicator: true,
    ),
    _ => const LocationSettings(accuracy: LocationAccuracy.high),
  };
}
