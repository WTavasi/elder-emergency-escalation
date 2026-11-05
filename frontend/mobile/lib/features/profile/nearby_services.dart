import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/location/journey_words.dart';
import '../../core/widgets/settings_list.dart';
import '../responder/alert_detail_screen.dart' show serviceIcon;

/// Who can come to an elder besides their circle, as rows: the emergency responder asked
/// by default when the circle does not answer, then the nearest ambulance, police and fire
/// service, each asked when what is happening needs it. Each with how far it is by road.
///
/// For the elder's own page and their circle's page about them alike, so both see the
/// same people the system would ask.
class NearbyServices extends StatefulWidget {
  const NearbyServices({
    required this.api,
    required this.elderId,
    this.forElder = false,
    this.plain = false,
    super.key,
  });

  final ApiClient api;
  final String elderId;

  /// Said to the elder as "you", to the circle as "they".
  final bool forElder;

  /// As lines in a page that has its own margins, rather than a row that opens.
  final bool plain;

  @override
  State<NearbyServices> createState() => _NearbyServicesState();
}

class _NearbyServicesState extends State<NearbyServices> {
  List<NearbyService>? _services;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final List<NearbyService> services = await widget.api.elderServices(widget.elderId);
      if (mounted) setState(() => _services = services);
    } on Exception {
      if (mounted) setState(() => _failed = true);
    }
  }

  /// When this service is asked, in a few words.
  String _when(ResponderService service) {
    final String family = widget.forElder ? 'your family' : 'the family';
    return switch (service) {
      ResponderService.general => "Asked if $family can't come",
      ResponderService.ambulance => 'Asked for chest pain, a fall or feeling unwell',
      ResponderService.police => "Asked if ${widget.forElder ? "you're" : "they're"} not safe",
      ResponderService.fire => 'Asked for a fire',
    };
  }

  @override
  Widget build(BuildContext context) {
    final List<NearbyService>? services = _services;
    final String summary = services == null
        ? (_failed ? "Couldn't load this." : 'Loading…')
        : services.isEmpty
        ? 'None near home yet'
        : services.map((NearbyService s) => s.service.title).join(', ');

    if (widget.plain) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _lines(services));
    }

    return SettingsExpandable(
      icon: Icons.local_hospital_outlined,
      title: widget.forElder ? 'Emergency services near you' : 'Emergency services near them',
      summary: summary,
      children: _lines(services),
    );
  }

  List<Widget> _lines(List<NearbyService>? services) {
    return <Widget>[
      if (services == null)
        SettingsDetail(title: _failed ? "Couldn't load this. Try again later." : 'Loading…')
      else if (services.isEmpty)
        SettingsDetail(
          title: 'None found near home.',
          note: widget.forElder
              ? 'Ask your caregiver to check your home address.'
              : 'Check their home address.',
        )
      else
        for (final NearbyService service in services)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.only(top: 10, right: 12),
                child: Icon(serviceIcon(service.service), size: 20),
              ),
              Expanded(
                child: SettingsDetail(
                  title: service.name,
                  note: <String>[
                    _when(service.service),
                    if (service.etaSeconds case final int seconds)
                      '${_capitalised(timeAway(seconds))} away${service.byRoad ? ' by road' : ''}',
                  ].join('. '),
                ),
              ),
            ],
          ),
    ];
  }

  static String _capitalised(String text) =>
      text.isEmpty ? text : '${text[0].toUpperCase()}${text.substring(1)}';
}
