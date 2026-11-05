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
import '../theme/theme.dart';

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

/// What a pin stands for, which decides its colour: red only where a person is still
/// needed, the "on the way" blue for anybody going, and ink for everything else.
enum PinKind {
  /// An elder nobody has taken on yet.
  needsSomebody,

  /// An elder somebody is already handling.
  elder,

  /// Somebody on their way.
  onTheWay,

  /// The person holding this phone.
  you,
}

/// One pin: where, what it is called on the map, and what tapping it does.
class MapPin {
  const MapPin({required this.at, required this.label, required this.kind, this.icon, this.onTap});

  final MapPoint at;
  final String label;
  final PinKind kind;
  final IconData? icon;

  /// Opens what the pin stands for, on the full-screen map. Null for a pin that opens
  /// nothing.
  final VoidCallback? onTap;
}

/// Everything a map shows at one moment, and the same in words.
class MapContents {
  const MapContents({
    required this.pins,
    required this.description,
    this.roads = const <List<MapPoint>>[],
  });

  final List<MapPin> pins;

  /// The roads people are taking, each a line of points.
  final List<List<MapPoint>> roads;

  /// What the map shows, for a screen reader and for anybody who cannot read a map.
  final String description;
}

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

/// One emergency on a map: the elder's place and everybody on their way to it.
class EmergencyMapData {
  const EmergencyMapData({
    required this.destination,
    required this.destinationLabel,
    this.travellers = const <MapTraveller>[],
    this.needsSomebody = false,
  });

  final MapPoint destination;
  final String destinationLabel;
  final List<MapTraveller> travellers;

  /// Nobody has taken it on yet, so the elder's pin is the red that means it.
  final bool needsSomebody;

  MapContents get contents => MapContents(
    pins: <MapPin>[
      MapPin(
        at: destination,
        label: destinationLabel,
        kind: needsSomebody ? PinKind.needsSomebody : PinKind.elder,
        icon: Icons.home,
      ),
      for (final MapTraveller who in travellers)
        MapPin(
          at: who.at,
          label: who.label,
          kind: who.isYou ? PinKind.you : PinKind.onTheWay,
          icon: who.isVolunteer ? Icons.volunteer_activism : Icons.directions_car,
        ),
    ],
    roads: <List<MapPoint>>[
      for (final MapTraveller who in travellers)
        if (who.path.length >= 2) who.path,
    ],
    description: describeMap(destinationLabel, travellers),
  );
}

/// What the map shows, in words, for a screen reader and for anybody who cannot read
/// a map: "Map showing where Grace is, and Peter about 6 minutes away."
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

/// A small map inside a screen, still, which opens full screen when tapped.
///
/// Still, because a map that pans under a scrolling page fights the scroll; the full
/// screen is where it moves. Drawn without tiles in widget tests, which have no network.
class EmergencyMap extends StatelessWidget {
  const EmergencyMap({
    required this.destination,
    required this.destinationLabel,
    this.travellers = const <MapTraveller>[],
    this.needsSomebody = false,
    this.height = 220,
    this.onOpen,
    super.key,
  });

  final MapPoint destination;

  /// Who is there: "Grace". The pin says it, so nobody has to guess which pin is the elder.
  final String destinationLabel;
  final List<MapTraveller> travellers;
  final bool needsSomebody;
  final double height;

  /// Opens the full-screen map. Null leaves the map still and not tappable.
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final MapContents contents = EmergencyMapData(
      destination: destination,
      destinationLabel: destinationLabel,
      travellers: travellers,
      needsSomebody: needsSomebody,
    ).contents;
    return SmallMap(contents: contents, height: height, onOpen: onOpen);
  }
}

/// Any map contents as a small, still map in a page, opening full screen when tapped.
class SmallMap extends StatelessWidget {
  const SmallMap({required this.contents, this.height = 220, this.onOpen, super.key});

  final MapContents contents;
  final double height;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: contents.description,
      button: onOpen != null,
      onTap: onOpen,
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(MzaziRadius.group),
        child: SizedBox(
          height: height,
          child: Stack(
            children: <Widget>[
              Positioned.fill(child: MapCanvas(contents: contents, interactive: false)),
              if (onOpen != null)
                Positioned.fill(
                  child: Material(
                    type: MaterialType.transparency,
                    child: InkWell(onTap: onOpen),
                  ),
                ),
              if (onOpen != null)
                const PositionedDirectional(
                  top: MzaziSpace.s8,
                  end: MzaziSpace.s8,
                  child: IgnorePointer(child: _RoundMark(icon: Icons.open_in_full)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The map itself, without a frame, for the small map and the full-screen one.
class MapCanvas extends StatefulWidget {
  const MapCanvas({required this.contents, required this.interactive, super.key});

  final MapContents contents;
  final bool interactive;

  @override
  State<MapCanvas> createState() => MapCanvasState();
}

class MapCanvasState extends State<MapCanvas> {
  final MapController _controller = MapController();
  bool _ready = false;

  /// Widget tests have no network, so they get the pins and roads without pictures.
  static final bool _drawTiles = kIsWeb || !Platform.environment.containsKey('FLUTTER_TEST');

  CameraFit get _fit => CameraFit.coordinates(
    coordinates: widget.contents.pins.map((MapPin pin) => _point(pin.at)).toList(),
    padding: const EdgeInsets.all(48),
    maxZoom: 16,
  );

  /// Back to everybody in view, after the person moved the map away.
  void showEveryone() {
    if (_ready && widget.contents.pins.isNotEmpty) _controller.fitCamera(_fit);
  }

  @override
  void didUpdateWidget(MapCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Somebody new on the map: the still map makes room for them. A map the person is
    // moving is left where they put it.
    if (!widget.interactive && oldWidget.contents.pins.length != widget.contents.pins.length) {
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
    final Color going = dark
        ? MzaziColorsDark.pillAcknowledgedFg
        : MzaziColorsLight.pillAcknowledgedFg;

    return FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCameraFit: widget.contents.pins.isEmpty ? null : _fit,
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
            for (final List<MapPoint> road in widget.contents.roads)
              Polyline(
                points: road.map(_point).toList(),
                strokeWidth: 5,
                color: going,
                borderStrokeWidth: 2,
                borderColor: theme.colorScheme.surface,
              ),
          ],
        ),
        MarkerLayer(
          markers: <Marker>[
            for (final MapPin pin in widget.contents.pins)
              Marker(
                point: _point(pin.at),
                width: 120,
                height: 64,
                alignment: Alignment.topCenter,
                child: _Pin(pin: pin, tappable: widget.interactive && pin.onTap != null),
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

/// A round pin with an icon and a name under it, so nobody has to match colours to a
/// key: the word says who it is, the colour only repeats it.
class _Pin extends StatelessWidget {
  const _Pin({required this.pin, required this.tappable});

  final MapPin pin;
  final bool tappable;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool dark = theme.brightness == Brightness.dark;
    final (Color fill, Color mark) = switch (pin.kind) {
      PinKind.needsSomebody => (
        dark ? MzaziColorsDark.danger : MzaziColorsLight.danger,
        theme.colorScheme.onError,
      ),
      PinKind.onTheWay => (
        dark ? MzaziColorsDark.pillAcknowledgedFg : MzaziColorsLight.pillAcknowledgedFg,
        theme.colorScheme.surface,
      ),
      PinKind.elder || PinKind.you => (theme.colorScheme.onSurface, theme.colorScheme.surface),
    };
    final IconData icon =
        pin.icon ??
        switch (pin.kind) {
          PinKind.you => Icons.my_location,
          PinKind.onTheWay => Icons.directions_car,
          PinKind.needsSomebody || PinKind.elder => Icons.home,
        };

    final Widget body = Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        DecoratedBox(
          decoration: BoxDecoration(
            color: fill,
            shape: BoxShape.circle,
            border: Border.all(color: theme.colorScheme.surface, width: 2),
          ),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(icon, size: 18, color: mark),
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
              pin.label,
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

    if (!tappable) return body;
    return Semantics(
      button: true,
      label: 'Open ${pin.label}',
      excludeSemantics: true,
      child: GestureDetector(onTap: pin.onTap, child: body),
    );
  }
}

/// A round surface button mark over the map, as Maps puts its controls.
class _RoundMark extends StatelessWidget {
  const _RoundMark({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        shape: BoxShape.circle,
      ),
      child: Padding(padding: const EdgeInsets.all(MzaziSpace.s8), child: Icon(icon, size: 20)),
    );
  }
}

/// The map full screen, where it can be moved and zoomed. Reads what to show from
/// [read] whenever [listenable] changes, so it keeps up while it is open.
///
/// The top bar has the back arrow and nothing else. Putting everybody back in view is a
/// round button on the map itself, where Maps keeps its own controls.
class EmergencyMapScreen extends StatefulWidget {
  const EmergencyMapScreen({
    required this.listenable,
    required this.read,
    this.actions = const <Widget>[],
    super.key,
  });

  final Listenable listenable;

  /// The map's contents now, or null once there is nothing to show.
  final MapContents? Function() read;

  /// Buttons under the map, such as directions.
  final List<Widget> actions;

  @override
  State<EmergencyMapScreen> createState() => _EmergencyMapScreenState();
}

class _EmergencyMapScreenState extends State<EmergencyMapScreen> {
  final GlobalKey<MapCanvasState> _canvas = GlobalKey<MapCanvasState>();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.listenable,
      builder: (BuildContext context, Widget? _) {
        final MapContents? contents = widget.read();
        return Scaffold(
          appBar: AppBar(),
          body: contents == null
              ? Padding(
                  padding: EdgeInsets.all(MzaziLayout.margin(context)),
                  child: Text(
                    'Nothing to show on the map now.',
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Expanded(
                      child: Stack(
                        children: <Widget>[
                          Positioned.fill(
                            child: Semantics(
                              label: contents.description,
                              child: MapCanvas(key: _canvas, contents: contents, interactive: true),
                            ),
                          ),
                          PositionedDirectional(
                            top: MzaziSpace.s12,
                            end: MzaziSpace.s12,
                            child: Tooltip(
                              message: 'Show everyone',
                              child: Material(
                                type: MaterialType.transparency,
                                child: InkResponse(
                                  onTap: () => _canvas.currentState?.showEveryone(),
                                  radius: 28,
                                  child: const SizedBox(
                                    width: 48,
                                    height: 48,
                                    child: Center(
                                      child: _RoundMark(icon: Icons.center_focus_strong_outlined),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (widget.actions.isNotEmpty)
                      SafeArea(
                        top: false,
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(
                            MzaziLayout.margin(context),
                            MzaziSpace.s16,
                            MzaziLayout.margin(context),
                            MzaziSpace.s16,
                          ),
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
