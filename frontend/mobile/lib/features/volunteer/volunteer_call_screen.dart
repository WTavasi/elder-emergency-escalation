import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/location/share_way_panel.dart';
import '../../core/location/way_there.dart';
import '../../core/map/emergency_map.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/fade_swap.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/swipe_to_confirm.dart';
import '../responder/widgets/call_button.dart';
import '../responder/widgets/directions_button.dart';
import 'nearby_screen.dart';
import 'volunteer_controller.dart';

/// One emergency a volunteer was asked about.
///
/// Before they answer: how far, how urgent, how long ago, and nothing about who or
/// where. Once they say they will go: the name, the address, a map, directions and a
/// call button, their own way there shared if they allow it, and "I'm here" when they
/// arrive. When it is over, all of that goes again.
class VolunteerCallScreen extends StatefulWidget {
  const VolunteerCallScreen({required this.eventId, super.key});

  final String eventId;

  @override
  State<VolunteerCallScreen> createState() => _VolunteerCallScreenState();
}

class _VolunteerCallScreenState extends State<VolunteerCallScreen> {
  WayThere? _way;
  bool _offeredSharing = false;
  SharingState? _lastState;

  @override
  void initState() {
    super.initState();
    unawaited(context.read<VolunteerController>().refreshCall(widget.eventId));
    _way = WayThere.maybeOf(context);
    _way?.addListener(_onWay);
  }

  @override
  void dispose() {
    _way?.removeListener(_onWay);
    super.dispose();
  }

  /// Arriving by position is the server's to notice; the screen then reads the call
  /// again, to say "You're with Grace" without the volunteer having to swipe.
  void _onWay() {
    final WayThere? way = _way;
    if (way == null) return;
    if (way.state != _lastState && way.state == SharingState.arrived && mounted) {
      unawaited(context.read<VolunteerController>().refreshCall(widget.eventId));
    }
    _lastState = way.state;
  }

  /// Shares the way there once they are going, if they turned sharing on, and stops it
  /// once they are there, have withdrawn, or it is over.
  void _followSharing(VolunteerCall call) {
    final WayThere? way = _way;
    if (way == null) return;
    final bool onTheWay = call.going && call.elder != null && call.arrivedAt == null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (onTheWay) {
        if (!_offeredSharing && way.enabled) {
          _offeredSharing = true;
          unawaited(way.shareFor(widget.eventId));
        }
      } else {
        way.stopFor(widget.eventId);
      }
    });
  }

  /// The elder's place and, while it is shared, the volunteer's own way there.
  EmergencyMapData? _mapData() {
    final VolunteerCall? call = context.read<VolunteerController>().call(widget.eventId);
    final VolunteerCallElder? elder = call?.elder;
    if (call == null || elder == null || !call.going) return null;
    final WayThere? way = _way;
    final Journey? mine = way != null && way.isSharingFor(widget.eventId) ? way.journey : null;
    final MapTraveller? me = mine == null
        ? null
        : MapTraveller.fromJourney(mine, 'You', isYou: true);
    return EmergencyMapData(
      destination: MapPoint(elder.latitude, elder.longitude),
      destinationLabel: _first(elder.name),
      travellers: <MapTraveller>[?me],
    );
  }

  void _openMap(VolunteerCallElder elder) {
    final VolunteerController volunteer = context.read<VolunteerController>();
    unawaited(
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (BuildContext _) => EmergencyMapScreen(
            listenable: Listenable.merge(<Listenable?>[volunteer, _way]),
            read: () => _mapData()?.contents,
            actions: <Widget>[
              DirectionsButton(
                latitude: elder.latitude,
                longitude: elder.longitude,
                addressLabel: elder.addressLabel,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _withdraw(VolunteerController volunteer) async {
    final bool? sure = await showActionSheet<bool>(
      context,
      title: 'Can no longer go?',
      message: "We'll ask other volunteers nearby. If you can, call to say you're not coming.",
      actions: const <SheetAction<bool>>[
        SheetAction<bool>(
          'I cannot go',
          true,
          icon: Icons.do_not_disturb_on_outlined,
          destructive: true,
        ),
        SheetAction<bool>("I'm still going", false, icon: Icons.directions_walk),
      ],
    );
    if (sure == true && mounted) {
      await volunteer.answer(widget.eventId, VolunteerAnswer.withdraw);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final VolunteerController volunteer = context.watch<VolunteerController>();
    final VolunteerCall? call = volunteer.call(widget.eventId);
    if (call != null) _followSharing(call);

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: call == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: EdgeInsets.fromLTRB(
                  MzaziLayout.margin(context),
                  0,
                  MzaziLayout.margin(context),
                  MzaziSpace.s32,
                ),
                children: <Widget>[
                  Semantics(
                    header: true,
                    child: Text(_headline(call), style: theme.textTheme.headlineLarge),
                  ),
                  const SizedBox(height: MzaziSpace.s8),
                  Text(callStanding(call), style: theme.textTheme.bodyLarge),
                  if (volunteer.error case final String failure) ...<Widget>[
                    const SizedBox(height: MzaziSpace.s16),
                    Notice(message: failure, isError: true),
                  ],
                  const SizedBox(height: MzaziSpace.s24),
                  ..._body(context, volunteer, call),
                ],
              ),
      ),
    );
  }

  String _headline(VolunteerCall call) {
    final VolunteerCallElder? elder = call.elder;
    if (elder != null) {
      return call.arrivedAt != null ? "You're with ${_first(elder.name)}" : elder.name;
    }
    if (!call.open) return 'This emergency has ended';
    return '${call.severity == Severity.critical ? 'Urgent: someone' : 'Someone'} '
        '${howFarAway(call.distanceMetres, byRoad: call.byRoad)} needs help';
  }

  List<Widget> _body(BuildContext context, VolunteerController volunteer, VolunteerCall call) {
    final ThemeData theme = Theme.of(context);
    final VolunteerCallElder? elder = call.elder;

    if (!call.open) {
      return <Widget>[Text('Thanks for being ready to help.', style: theme.textTheme.bodyLarge)];
    }

    if (call.going && elder != null) {
      final String first = _first(elder.name);
      final WayThere? way = _way;
      return <Widget>[
        if (elder.addressLabel case final String address) ...<Widget>[
          Text(address, style: theme.textTheme.titleMedium),
          const SizedBox(height: MzaziSpace.s16),
        ],
        if (call.arrivedAt == null) ...<Widget>[
          if (way == null)
            _VolunteerMap(data: _mapData(), onOpen: () => _openMap(elder))
          else
            ListenableBuilder(
              listenable: way,
              builder: (BuildContext context, Widget? _) =>
                  _VolunteerMap(data: _mapData(), onOpen: () => _openMap(elder)),
            ),
          const SizedBox(height: MzaziSpace.s12),
        ],
        DirectionsButton(
          latitude: elder.latitude,
          longitude: elder.longitude,
          addressLabel: elder.addressLabel,
        ),
        const SizedBox(height: MzaziSpace.s12),
        CallButton(name: first, phone: elder.phone),
        const SizedBox(height: MzaziSpace.s16),
        Text(
          call.circleOwner == null
              ? "We've told $first's family you're going. We're still asking them too."
              : '${call.circleOwner} from $first\'s family is also on the way.',
          style: theme.textTheme.bodyMedium,
        ),
        if (way != null && call.arrivedAt == null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s24),
          ShareWayPanel(way: way, eventId: widget.eventId, elderFirst: first),
        ],
        const SizedBox(height: MzaziSpace.s24),
        // The swipe fades and folds away once it lands, rather than vanishing.
        FadeSwap(
          child: call.arrivedAt == null
              ? Column(
                  key: const ValueKey<String>('going'),
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    SwipeToConfirm(
                      label: "Swipe when you're with $first",
                      enabled: !volunteer.busy,
                      onConfirmed: () =>
                          unawaited(volunteer.answer(widget.eventId, VolunteerAnswer.arrived)),
                    ),
                    const SizedBox(height: MzaziSpace.s16),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: volunteer.busy ? null : () => unawaited(_withdraw(volunteer)),
                        child: const Text('I can no longer go'),
                      ),
                    ),
                  ],
                )
              : Text(
                  "Their family can see you're there. Stay until family or emergency services "
                  'arrive, if you can.',
                  key: const ValueKey<String>('arrived'),
                  style: theme.textTheme.bodyLarge,
                ),
        ),
      ];
    }

    if (call.takenByAnother) {
      return <Widget>[
        Text(
          'Another volunteer is going. Thanks for being ready.',
          style: theme.textTheme.bodyLarge,
        ),
      ];
    }

    return <Widget>[
      Text(
        "An older person needs help. Tap I can go to see who and where. We'll tell their "
        "family you're coming.",
        style: theme.textTheme.bodyLarge,
      ),
      const SizedBox(height: MzaziSpace.s24),
      FilledButton(
        onPressed: volunteer.busy
            ? null
            : () => unawaited(volunteer.answer(widget.eventId, VolunteerAnswer.accept)),
        child: const Text('I can go'),
      ),
      if (call.status != VolunteerCallStatus.declined) ...<Widget>[
        const SizedBox(height: MzaziSpace.s12),
        OutlinedButton(
          onPressed: volunteer.busy
              ? null
              : () => unawaited(volunteer.answer(widget.eventId, VolunteerAnswer.decline)),
          child: const Text('I cannot go'),
        ),
      ],
    ];
  }

  static String _first(String name) => name.trim().split(RegExp(r'\s+')).first;
}

/// The small map on the volunteer's screen, or nothing when there is nothing to show.
class _VolunteerMap extends StatelessWidget {
  const _VolunteerMap({required this.data, required this.onOpen});

  final EmergencyMapData? data;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final EmergencyMapData? map = data;
    if (map == null) return const SizedBox.shrink();
    return EmergencyMap(
      destination: map.destination,
      destinationLabel: map.destinationLabel,
      travellers: map.travellers,
      onOpen: onOpen,
    );
  }
}
