import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Durations that respect the phone's Reduce Motion setting.
///
/// Every animation in the app asks here rather than reading a token directly. With
/// Reduce Motion (iOS) or Remove animations (Android) on, movement collapses to an
/// instant change. The state still changes, it just stops travelling.
abstract final class Motion {
  static bool reduced(BuildContext context) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  static Duration of(BuildContext context, Duration duration) =>
      reduced(context) ? Duration.zero : duration;
}

/// The four things a phone's vibration says in this app, and nothing else.
///
/// Kept to four on purpose. A vibration for every tap teaches people to ignore it;
/// these mark the moments that matter: a press registered, something confirmed, time
/// running out, and something that needs attention.
abstract final class Haptics {
  /// A press on a control that starts something.
  static Future<void> press() => HapticFeedback.selectionClick();

  /// Something the person did has taken: an alert raised, a swipe completed.
  static Future<void> confirm() => HapticFeedback.mediumImpact();

  /// One second gone from a countdown the person can still act on, so it can be felt
  /// with the phone face down or the screen unread. Lighter than [attention], because
  /// it repeats.
  static Future<void> tick() => HapticFeedback.lightImpact();

  /// Something needs them: an alert arriving while the screen is open.
  static Future<void> attention() => HapticFeedback.heavyImpact();
}
