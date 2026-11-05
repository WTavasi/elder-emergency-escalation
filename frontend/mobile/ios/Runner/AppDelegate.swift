import AppIntents
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "QuickHelp") {
      QuickHelpBridge.shared.attach(registrar.messenger())
    }
  }
}

/// Holds a request for help from Siri until the app takes it, so a request that opened
/// the app is not lost while Flutter starts. The app asks with "takePending"; when it is
/// already open it is told "help" and asks the same way, so one request is acted on once.
final class QuickHelpBridge {
  static let shared = QuickHelpBridge()

  private var pending: [String: String]?
  private var channel: FlutterMethodChannel?

  func attach(_ messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: "ke.ac.strathmore.mzazicare/quick_help",
      binaryMessenger: messenger
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard call.method == "takePending" else {
        result(FlutterMethodNotImplemented)
        return
      }
      result(self?.pending)
      self?.pending = nil
    }
    self.channel = channel
  }

  func request(type: String?) {
    var request = ["from": "siri"]
    if let type { request["type"] = type }
    pending = request
    channel?.invokeMethod("help", arguments: nil)
  }
}

/// What is happening, as Siri hears it: "MzaziCare help fire", "MzaziCare msaada moto".
/// The words are matched by Siri on the phone; the type is all that reaches the app.
@available(iOS 16.0, *)
enum HelpKind: String, AppEnum {
  case fire
  case fall
  case breathing
  case unwell
  case unsafe

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "What's happening"

  static var caseDisplayRepresentations: [HelpKind: DisplayRepresentation] = [
    .fire: DisplayRepresentation(title: "Fire", synonyms: ["a fire", "smoke", "moto"]),
    .fall: DisplayRepresentation(
      title: "I fell", synonyms: ["fall", "fell", "a fall", "nimeanguka"]),
    .breathing: DisplayRepresentation(
      title: "Chest pain or breathing",
      synonyms: ["chest pain", "breathing", "can't breathe", "heart", "kifua"]),
    .unwell: DisplayRepresentation(
      title: "I feel unwell", synonyms: ["unwell", "sick", "ill", "naumwa"]),
    .unsafe: DisplayRepresentation(
      title: "I'm not safe",
      synonyms: ["police", "thief", "thieves", "robbery", "intruder", "polisi", "wezi"]),
  ]

  /// The name the API uses.
  var wire: String {
    switch self {
    case .fire: return "FIRE"
    case .fall: return "FALL"
    case .breathing: return "BREATHING"
    case .unwell: return "UNWELL"
    case .unsafe: return "UNSAFE"
    }
  }
}

/// Asks for help exactly as the button does, countdown and all, with what is happening
/// when it was said. Opens the app: the alert is raised there, signed in as the elder,
/// and the elder sees the countdown and can stop it.
@available(iOS 16.0, *)
struct AskForHelpIntent: AppIntent {
  static var title: LocalizedStringResource = "Ask for help"
  static var description = IntentDescription(
    "Tells your family, and the right service for what is happening.")
  static var openAppWhenRun: Bool = true

  @Parameter(title: "What's happening")
  var kind: HelpKind?

  @MainActor
  func perform() async throws -> some IntentResult {
    QuickHelpBridge.shared.request(type: kind?.wire)
    return .result()
  }
}

/// "Hey Siri, MzaziCare help", "Hey Siri, MzaziCare help fire". Ready without setting
/// anything up: App Shortcuts are there as soon as the app is installed and opened once.
@available(iOS 16.0, *)
struct MzaziCareShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AskForHelpIntent(),
      phrases: [
        "\(.applicationName) help",
        "\(.applicationName) help \(\.$kind)",
        "Ask \(.applicationName) for help",
        "\(.applicationName) msaada",
        "\(.applicationName) msaada \(\.$kind)",
      ],
      shortTitle: "Ask for help",
      systemImageName: "sos"
    )
  }
}
