import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../profile/profile_screen.dart';
import 'nearby_screen.dart';
import 'volunteer_controller.dart';
import 'volunteering_screen.dart';

/// The app for a community volunteer: who near them needs help, their application and
/// availability, and their own account.
class VolunteerHome extends StatefulWidget {
  const VolunteerHome({required this.api, super.key});

  final ApiClient api;

  @override
  State<VolunteerHome> createState() => _VolunteerHomeState();
}

class _VolunteerHomeState extends State<VolunteerHome> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    context.read<VolunteerController>().start();
  }

  @override
  Widget build(BuildContext context) {
    final int waiting = context.select<VolunteerController, int>(
      (VolunteerController volunteer) => volunteer.waiting.length,
    );

    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: <Widget>[
          NearbyScreen(onOpenApplication: () => setState(() => _index = 1)),
          VolunteeringScreen(api: widget.api),
          const ProfileScreen(),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (int index) => setState(() => _index = index),
          destinations: <Widget>[
            NavigationDestination(
              icon: Badge(
                isLabelVisible: waiting > 0,
                label: Text('$waiting'),
                child: const Icon(Icons.near_me_outlined),
              ),
              selectedIcon: Badge(
                isLabelVisible: waiting > 0,
                label: Text('$waiting'),
                child: const Icon(Icons.near_me),
              ),
              label: 'Nearby',
              tooltip: waiting > 0 ? 'Nearby, $waiting asking' : 'Nearby',
            ),
            const NavigationDestination(
              icon: Icon(Icons.volunteer_activism_outlined),
              selectedIcon: Icon(Icons.volunteer_activism),
              label: 'Volunteering',
            ),
            const NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: 'Me',
            ),
          ],
        ),
      ),
    );
  }
}
