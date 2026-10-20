import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// The Firebase project this build talks to, given at build time and never committed.
///
///   flutter run --dart-define-from-file=firebase.local.json
///
/// firebase.local.json is gitignored; firebase.example.json shows its shape. Every value
/// is on the Firebase console under Project settings, Your apps. Without them the app
/// runs exactly as before, minus push: nothing is initialised, nothing is asked for,
/// and live updates still arrive over the socket while the app is open.
///
/// Options in Dart rather than google-services.json and GoogleService-Info.plist, so
/// the build needs no extra Gradle plugin and no file that could be committed by
/// mistake, and a build without push is the same build with fewer defines.
class FirebaseConfig {
  const FirebaseConfig({
    required this.projectId,
    required this.senderId,
    required this.androidApiKey,
    required this.androidAppId,
    required this.iosApiKey,
    required this.iosAppId,
    required this.iosBundleId,
  });

  const FirebaseConfig.fromEnvironment()
    : projectId = const String.fromEnvironment('FIREBASE_PROJECT_ID'),
      senderId = const String.fromEnvironment('FIREBASE_SENDER_ID'),
      androidApiKey = const String.fromEnvironment('FIREBASE_ANDROID_API_KEY'),
      androidAppId = const String.fromEnvironment('FIREBASE_ANDROID_APP_ID'),
      iosApiKey = const String.fromEnvironment('FIREBASE_IOS_API_KEY'),
      iosAppId = const String.fromEnvironment('FIREBASE_IOS_APP_ID'),
      iosBundleId = const String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');

  final String projectId;
  final String senderId;
  final String androidApiKey;
  final String androidAppId;
  final String iosApiKey;
  final String iosAppId;
  final String iosBundleId;

  /// The options for [platform], or null when this build was not given them. Null is
  /// the ordinary development case, not an error.
  FirebaseOptions? optionsFor(TargetPlatform platform) {
    if (projectId.isEmpty || senderId.isEmpty) return null;

    return switch (platform) {
      TargetPlatform.android when androidApiKey.isNotEmpty && androidAppId.isNotEmpty =>
        FirebaseOptions(
          apiKey: androidApiKey,
          appId: androidAppId,
          messagingSenderId: senderId,
          projectId: projectId,
        ),
      TargetPlatform.iOS when iosApiKey.isNotEmpty && iosAppId.isNotEmpty => FirebaseOptions(
        apiKey: iosApiKey,
        appId: iosAppId,
        messagingSenderId: senderId,
        projectId: projectId,
        iosBundleId: iosBundleId.isEmpty ? null : iosBundleId,
      ),
      _ => null,
    };
  }
}
