/// The way there, in words a person reads at a glance.
///
/// Apart from the sharing itself so that the elder's screen, which shows the time and
/// never handles a position, does not have to import anything about locations.
library;

/// "About 9 minutes" or "about 1 hour 15 minutes", for a time to arrival.
///
/// Broken into hours past the hour, because "75 minutes" makes the reader do the sum
/// at the moment they least want to.
String timeAway(int seconds) {
  if (seconds < 60) return 'less than a minute';
  final int minutes = (seconds / 60).round();
  if (minutes < 60) return 'about ${_count(minutes, 'minute')}';
  final int hours = minutes ~/ 60;
  final int rest = minutes % 60;
  return rest == 0
      ? 'about ${_count(hours, 'hour')}'
      : 'about ${_count(hours, 'hour')} ${_count(rest, 'minute')}';
}

String _count(int n, String unit) => n == 1 ? '1 $unit' : '$n ${unit}s';

/// "4.2 km" or "650 m", for a distance on the way there.
String distanceWords(int metres) {
  if (metres < 1000) return '${(metres / 10).round() * 10} m';
  return '${(metres / 1000).toStringAsFixed(1)} km';
}
