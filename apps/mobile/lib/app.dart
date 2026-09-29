import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'api/models.dart';
import 'auth/auth_controller.dart';
import 'auth/sign_in_screen.dart';
import 'elder/alert_controller.dart';
import 'elder/elder_home_screen.dart';
import 'responder/alert_list_screen.dart';
import 'responder/alerts_controller.dart';
import 'theme/theme.dart';

/// The app.
///
/// Routing is by role rather than by a named route table, because which screens exist
/// for a person is decided by what they are, not by where they navigated. An elder
/// cannot reach a caregiver's alert list by any path, because no path to it is built
/// for that account.
class MzaziCareApp extends StatelessWidget {
  const MzaziCareApp({required this.api, super.key});

  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    final AuthController auth = context.watch<AuthController>();

    // The elder scale until we know otherwise. A caregiver seeing one oversized frame
    // for an instant is harmless; an elder seeing a 16pt screen is not.
    final AppAudience audience = auth.account?.role == Role.elder || auth.account == null
        ? AppAudience.elder
        : AppAudience.standard;

    return MaterialApp(
      title: 'MzaziCare',
      debugShowCheckedModeBanner: false,
      theme: MzaziTheme.light(audience),
      darkTheme: MzaziTheme.dark(audience),
      home: _Home(api: api, auth: auth),
    );
  }
}

class _Home extends StatelessWidget {
  const _Home({required this.api, required this.auth});

  final ApiClient api;
  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    if (auth.isRestoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (!auth.isSignedIn) return const SignInScreen();

    return switch (auth.account!.role) {
      Role.elder => ChangeNotifierProvider<AlertController>(
        // Keyed on the account, so signing out and back in as somebody else builds a
        // fresh controller rather than inheriting the previous person's emergency.
        key: ValueKey<String>(auth.account!.id),
        create: (_) => AlertController(api: api),
        child: const ElderHomeScreen(),
      ),
      // Everybody who responds to an emergency gets the same screen. The differences
      // between a caregiver, a family member and an emergency responder are differences
      // in who gets asked and when, which the server decides; what each of them does
      // when asked is identical, so a separate screen per role would be three copies of
      // one screen.
      Role.caregiver ||
      Role.familyMember ||
      Role.emergencyResponder => ChangeNotifierProvider<AlertsController>(
        key: ValueKey<String>(auth.account!.id),
        create: (_) => AlertsController(api: api),
        child: AlertListScreen(api: api),
      ),
      _ => const _ConsoleOnly(),
    };
  }
}

/// For a role with no place in this app. Honest about it, rather than an empty screen
/// that looks broken.
class _ConsoleOnly extends StatelessWidget {
  const _ConsoleOnly();

  @override
  Widget build(BuildContext context) {
    final AuthController auth = context.read<AuthController>();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  'Administrators work from the web console, not the app.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 24),
                OutlinedButton(onPressed: auth.signOut, child: const Text('Sign out')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
