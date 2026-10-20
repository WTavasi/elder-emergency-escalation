/// The way there, in words a person reads at a glance.
///
/// Apart from the sharing itself so that the elder's screen, which shows the time and
/// never handles a position, does not have to import anything about locations.
library;

/// "About 9 minutes", for a time to arrival.
String minutesAway(int seconds) {
  if (seconds < 60) return 'less than a minute';
  final int minutes = (seconds / 60).round();
  return minutes == 1 ? 'about 1 minute' : 'about $minutes minutes';
}

/// "4.2 km" or "650 m", for a distance on the way there.
String distanceWords(int metres) {
  if (metres < 1000) return '${(metres / 10).round() * 10} m';
  return '${(metres / 1000).toStringAsFixed(1)} km';
}
