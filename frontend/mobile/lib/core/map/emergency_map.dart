import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/models.dart';
import '../location/journey_words.dart';

/// Where map pictures come from. OpenStreetMap's own by default, which its tile policy
/// (https://operations.osmfoundation.org/policies/tiles/) allows for an app like this
/// one at a small scale, with attribution and an identifying User-Agent, both of which
/// the map sends. A busier deployment points `MAP_TILES_URL` at a tile provider or its
/// own tile server, in the same `{z}/{x}/{y}` form.
const String mapTilesUrl = String.fromEnvironment(
  'MAP_TILES_URL',
  defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
);

/// Who the map says the tiles came from. Required by OpenStreetMap's licence; a
/// different tile source names its own here, with `MAP_TILES_CREDIT`.
const String mapTilesCredit = String.fromEnvironment(
  'MAP_TILES_CREDIT',
  defaultValue: '© OpenStreetMap contributors',
);

/// Somebody on their way, as a pin on the map.
class MapTraveller {
  const MapTraveller({
    required this.name,
    required this.at,
    this.path = const <MapPoint>[],
    this.etaSeconds,
    this.isYou = false,
    this.isVolunteer = false,
  });

  /// From a journey, when it carries a position: the circle's copy does, the elder's never.
  static MapTraveller? fromJourney(Journey journey, String name, {bool isYou = false}) {
    if (!journey.hasPosition) return null;
    return MapTraveller(
      name: name,
      at: MapPoint(journey.latitude!, journey.longitude!),
      path: journey.path,
      etaSeconds: journey.etaSeconds,
      isYou: isYou,
      isVolunteer: journey.traveller == Traveller.volunteer,
    );
  }

  final String name;
  final MapPoint at;

  /// The road they are taking. Empty when it is a straight-line estimate, which is not
  /// drawn: a line across buildings would claim a route nobody worked out.
  final List<MapPoint> path;
  final int? etaSeconds;

  /// The person holding this phone, shown as "You".
  final bool isYou;
  final bool isVolunteer;

  String get label => isYou ? 'You' : name.trim().split(RegExp(r'\s+')).first;
}

/// The elder's place, everybody on their way, and the road each is taking.
///
/// Small and still inside a screen, because a map that pans under a scrolling page
/// fights the scroll; a tap opens it full screen, where it moves. Drawn without tiles in
/// widget tests, which have no network.
class EmergencyMap extends StatelessWidget {
  const EmergencyMap({
    required this.destination,
    required this.destinationLabel,
    this.travellers = const <MapTraveller>[],
    this.height = 220,
    this.onOpen,
    super.key,
  });

  final MapPoint destination;

  /// Who is there: "Grace". The pin says it, so nobody has to guess which pin is the elder.
  final String destinationLabel;
  final List<MapTraveller> travellers;
  final double height;

  /// Opens the full-screen map. Null leaves the map still and not tappable.
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = BorderRadius.circular(MzaziRadius.group);
    return Semantics(
      label: describeMap(destinationLabel, travellers),
      button: onOpen != null,
      onTap: onOpen,
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: radius,
        child: SizedBox(
          height: height,
          child: Stack(
            children: <Widget>[
              Positioned.fill(
                child: MapCanvas(
                  destination: destination,
                  destinationLabel: destinationLabel,
                  travellers: travellers,
                  interactive: false,
                ),
              ),
              if (onOpen != null)
                Positioned.fill(
                  child: Material(
                    type: MaterialType.transparency,
                    child: InkWell(onTap: onOpen),
                  ),
                ),
              if (onOpen != null)
                PositionedDirectional(
                  top: MzaziSpace.s8,
                  end: MzaziSpace.s8,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        shape: BoxShape.circle,
                      ),
                      child: const Padding(
                        padding: EdgeInsets.all(MzaziSpace.s8),
                        child: Icon(Icons.open_in_full, size: 20),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// What the map shows, in words, for a screen reader and for anybody who cannot read
/// a map: "Map: Grace, and Mary about 6 minutes away by road."
String describeMap(String destinationLabel, List<MapTraveller> travellers) {
  if (travellers.isEmpty) return 'Map showing where $destinationLabel is.';
  final List<String> people = travellers.map((MapTraveller who) {
    final int? eta = who.etaSeconds;
    final String name = who.isYou ? 'you' : who.label;
    return eta == null ? name : '$name ${timeAway(eta)} away';
  }).toList();
  final String list = people.length == 1
      ? people.first
      : '${people.sublist(0, people.length - 1).join(', ')} and ${people.last}';
  return 'Map showing where $destinationLabel is, and $list.';
}

/// The map itself, without a frame, for the small map and the full-screen one.
class MapCanvas extends StatefulWidget {
  const MapCanvas({
    required this.destination,
    required this.destinationLabel,
    required this.travellers,
    required this.interactive,
    super.key,
  });

  final MapPoint destination;
  final String destinationLabel;
  final List<MapTraveller> travellers;
  final bool interactive;

  @override
  State<MapCanvas> createState() => MapCanvasState();
}

class MapCanvasState extends State<MapCanvas> {
  final MapController _controller = MapController();
  bool _ready = false;

  /// Widget tests have no network, so they get the pins and roads without pictures.
  static final bool _drawTiles = kIsWeb || !Platform.environment.containsKey('FLUTTER_TEST');

  List<LatLng> get _everyone => <LatLng>[
    _point(widget.destination),
    for (final MapTraveller who in widget.travellers) _point(who.at),
  ];

  CameraFit get _fit =>
      CameraFit.coordinates(coordinates: _everyone, padding: const EdgeInsets.all(48), maxZoom: 16);

  /// Back to everybody in view, after the person moved the map away.
  void showEveryone() {
    if (_ready) _controller.fitCamera(_fit);
  }

  @override
  void didUpdateWidget(MapCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Somebody new on their way: the still map makes room for them. A map the person
    // is moving is left where they put it.
    if (!widget.interactive && oldWidget.travellers.length != widget.travellers.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) => showEveryone());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool dark = theme.brightness == Brightness.dark;
    final Color owner = theme.colorScheme.primary;
    final Color volunteer = theme.colorScheme.tertiary;

    return FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCameraFit: _fit,
        backgroundColor: theme.colorScheme.surfaceContainerHighest,
        onMapReady: () => _ready = true,
        interactionOptions: InteractionOptions(
          flags: widget.interactive
              ? InteractiveFlag.drag | InteractiveFlag.pinchZoom | InteractiveFlag.doubleTapZoom
              : InteractiveFlag.none,
        ),
      ),
      children: <Widget>[
        if (_drawTiles)
          TileLayer(
            urlTemplate: mapTilesUrl,
            userAgentPackageName: 'ke.ac.strathmore.mzazicare',
            // Darker pictures in dark mode, so the map is not a bright patch at night.
            tileBuilder: dark ? darkModeTileBuilder : null,
          ),
        PolylineLayer(
          polylines: <Polyline>[
            for (final MapTraveller who in widget.travellers)
              if (who.path.length >= 2)
                Polyline(
                  points: who.path.map(_point).toList(),
                  strokeWidth: 5,
                  color: who.isVolunteer ? volunteer : owner,
                  borderStrokeWidth: 2,
                  borderColor: theme.colorScheme.surface,
                ),
          ],
        ),
        MarkerLayer(
          markers: <Marker>[
            Marker(
              point: _point(widget.destination),
              width: 120,
              height: 64,
              alignment: Alignment.topCenter,
              child: _Pin(
                label: widget.destinationLabel,
                icon: Icons.home,
                colour: theme.colorScheme.error,
                onColour: theme.colorScheme.onError,
              ),
            ),
            for (final MapTraveller who in widget.travellers)
              Marker(
                point: _point(who.at),
                width: 120,
                height: 64,
                alignment: Alignment.topCenter,
                child: _Pin(
                  label: who.label,
                  icon: who.isVolunteer ? Icons.volunteer_activism : Icons.directions_car,
                  colour: who.isVolunteer ? volunteer : owner,
                  onColour: who.isVolunteer
                      ? theme.colorScheme.onTertiary
                      : theme.colorScheme.onPrimary,
                ),
              ),
          ],
        ),
        const _Credit(),
      ],
    );
  }

  static LatLng _point(MapPoint point) => LatLng(point.latitude, point.longitude);
}

/// Who drew the map, in the corner, as OpenStreetMap's licence asks. One line that
/// shortens rather than spills on a narrow phone, and opens the licence when tapped.
class _Credit extends StatelessWidget {
  const _Credit();

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Align(
      alignment: AlignmentDirectional.bottomEnd,
      child: GestureDetector(
        onTap: () => unawaited(
          launchUrl(
            Uri.https('www.openstreetmap.org', '/copyright'),
            mode: LaunchMode.externalApplication,
          ).catchError((Object _) => false),
        ),
        child: LayoutBuilder(
          builder: (BuildContext context, BoxConstraints room) => ConstrainedBox(
            constraints: BoxConstraints(maxWidth: room.maxWidth),
            child: ColoredBox(
              color: theme.colorScheme.surface.withValues(alpha: 0.85),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                child: Text(
                  mapTilesCredit,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textScaler: TextScaler.noScaling,
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontSize: 11,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A round pin with an icon, and a name under it, so nobody has to match colours to a key.
class _Pin extends StatelessWidget {
  const _Pin({
    required this.label,
    required this.icon,
    required this.colour,
    required this.onColour,
  });

  final String label;
  final IconData icon;
  final Color colour;
  final Color onColour;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        DecoratedBox(
          decoration: BoxDecoration(
            color: colour,
            shape: BoxShape.circle,
            border: Border.all(color: theme.colorScheme.surface, width: 2),
          ),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(icon, size: 18, color: onColour),
          ),
        ),
        const SizedBox(height: 2),
        DecoratedBox(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(MzaziRadius.input),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              // A fixed size: a map label that grew with the text scale would cover
              // the map. The same words are in the text beside it, at the person's size.
              textScaler: TextScaler.noScaling,
              style: theme.textTheme.labelMedium?.copyWith(
                fontSize: 13,
                color: theme.colorScheme.onSurface,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// The map full screen, where it can be moved and zoomed. Reads its people from
/// [read] whenever [listenable] changes, so it keeps up while it is open.
class EmergencyMapScreen extends StatefulWidget {
  const EmergencyMapScreen({
    required this.listenable,
    required this.read,
    this.actions = const <Widget>[],
    super.key,
  });

  final Listenable listenable;

  /// The map's current contents, or null once there is nothing to show, which closes it.
  final EmergencyMapData? Function() read;

  /// Buttons under the map, such as directions.
  final List<Widget> actions;

  @override
  State<EmergencyMapScreen> createState() => _EmergencyMapScreenState();
}

/// Everything a map shows at one moment.
class EmergencyMapData {
  const EmergencyMapData({
    required this.destination,
    required this.destinationLabel,
    this.travellers = const <MapTraveller>[],
  });

  final MapPoint destination;
  final String destinationLabel;
  final List<MapTraveller> travellers;
}

class _EmergencyMapScreenState extends State<EmergencyMapScreen> {
  final GlobalKey<MapCanvasState> _canvas = GlobalKey<MapCanvasState>();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.listenable,
      builder: (BuildContext context, Widget? _) {
        final EmergencyMapData? data = widget.read();
        return Scaffold(
          appBar: AppBar(
            title: const Text('Map'),
            actions: <Widget>[
              if (data != null)
                IconButton(
                  tooltip: 'Show everyone',
                  icon: const Icon(Icons.center_focus_strong_outlined),
                  onPressed: () => _canvas.currentState?.showEveryone(),
                ),
            ],
          ),
          body: data == null
              ? const Center(child: Text('Nothing to show on the map now.'))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Expanded(
                      child: Semantics(
                        label: describeMap(data.destinationLabel, data.travellers),
                        child: MapCanvas(
                          key: _canvas,
                          destination: data.destination,
                          destinationLabel: data.destinationLabel,
                          travellers: data.travellers,
                          interactive: true,
                        ),
                      ),
                    ),
                    if (widget.actions.isNotEmpty)
                      SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.all(MzaziSpace.s16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: widget.actions,
                          ),
                        ),
                      ),
                  ],
                ),
        );
      },
    );
  }
}
