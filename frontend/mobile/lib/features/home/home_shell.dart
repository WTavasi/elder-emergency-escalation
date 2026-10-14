import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../elders/elders_screen.dart';
import '../profile/profile_screen.dart';
import '../responder/alert_list_screen.dart';
import '../responder/alerts_controller.dart';

/// The app for everybody who responds: alerts, the people they look after, and their
/// own account, along the bottom of the screen.
///
/// These used to be four icons in the alert list's top bar, next to a refresh button and
/// sign out: the furthest point on the screen from a thumb, for the things reached most
/// often. A bottom bar is where both platforms put a handful of top-level places.
///
/// A responder looks after nobody in particular, being matched by area, so has no
/// People tab.
class HomeShell extends StatefulWidget {
  const HomeShell({required this.api, required this.role, super.key});

  final ApiClient api;
  final Role role;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  bool get _looksAfterPeople => widget.role == Role.caregiver || widget.role == Role.familyMember;

  @override
  Widget build(BuildContext context) {
    final int waiting = context.select<AlertsController, int>(
      (AlertsController alerts) => alerts.unansweredCount,
    );

    final List<Widget> pages = <Widget>[
      AlertListScreen(api: widget.api),
      if (_looksAfterPeople)
        EldersScreen(api: widget.api, isCaregiver: widget.role == Role.caregiver),
      const ProfileScreen(),
    ];

    return Scaffold(
      // Kept alive side by side, so switching tabs never loses a scroll position or
      // restarts the alert poll.
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (int index) => setState(() => _index = index),
          destinations: <Widget>[
            NavigationDestination(
              // The count of emergencies nobody has answered, on the tab itself, so it
              // can be seen from anywhere in the app.
              icon: Badge(
                isLabelVisible: waiting > 0,
                label: Text('$waiting'),
                child: const Icon(Icons.notifications_none),
              ),
              selectedIcon: Badge(
                isLabelVisible: waiting > 0,
                label: Text('$waiting'),
                child: const Icon(Icons.notifications),
              ),
              label: 'Alerts',
              tooltip: waiting > 0 ? 'Alerts, $waiting waiting' : 'Alerts',
            ),
            if (_looksAfterPeople)
              const NavigationDestination(
                icon: Icon(Icons.people_outline),
                selectedIcon: Icon(Icons.people),
                label: 'People',
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
