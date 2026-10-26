import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/section_label.dart';

/// The sentence the Kenya Data Protection Act's vital interests ground asks this notice
/// to carry. Kept as one constant so a test can hold the screen to it word for word.
const String vitalInterestsSentence =
    'If location or contact sharing has been withdrawn, the people answering an open '
    'emergency still see the elder\'s number, home and where the alert was raised, '
    'because protecting a person\'s life is a lawful reason on its own (vital interests). '
    'Once the emergency closes, the withdrawal applies again.';

/// The retention rule in one sentence, with the server's own figures when they are
/// known and in general terms when they are not, so the notice never promises a number
/// the server does not enforce.
String retentionSentence(LegalFacts? facts) {
  if (facts == null) {
    return 'Closed emergencies and their records are deleted automatically after the period '
        'set on the server. An open emergency is never deleted.';
  }
  if (!facts.retentionEnabled) {
    return 'Automatic deletion is switched off on this server, so records are kept until '
        'it is switched back on.';
  }
  return 'Closed emergencies are deleted ${facts.closedEmergencyDays} days after they close. '
      'The record of who did what, and daily check-in answers, are deleted after '
      '${facts.auditLogDays} days. An open emergency is never deleted.';
}

/// The privacy notice: what is kept, why, who sees it, for how long, and how to change
/// your mind. A screen rather than a linked PDF, so it can be read on the phone it is
/// about, before an account exists.
class PrivacyNoticeScreen extends StatelessWidget {
  const PrivacyNoticeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _LegalPage(
      title: 'Privacy notice',
      version: (LegalFacts facts) => facts.privacyVersion,
      sections: (LegalFacts? facts) => <_Section>[
        const _Section('What MzaziCare is for', <String>[
          'MzaziCare lets an older person ask for help with one press, and asks the people '
              'who look after them, in order, until somebody takes it on.',
        ]),
        const _Section('What is kept', <String>[
          'Everyone: name, phone number, email if you give one, your role, and a scrambled '
              'form of your password that cannot be turned back into it.',
          'An elder: their home address, how much help they need (set by a caregiver, not a '
              'diagnosis), and where they are staying if somebody records a stay.',
          'Each emergency: when and where it was raised, who was asked, who answered and '
              'when, and how it ended. Calls inside the app record who joined and when, never '
              'what was said.',
          'Daily check-ins, if they are turned on: the times, and whether each was answered.',
          'Volunteers: the area you help in, how far you will go, your training and whether '
              'you are available.',
          'What was agreed, by whom, on whose behalf, and anything withdrawn.',
        ]),
        const _Section('What is not kept', <String>[
          'Your phone\'s location is never tracked. A place is recorded once, when an alert '
              'is raised. If you turn on Share my way there, your position is used while you '
              'are on your way to an emergency and not kept after you arrive.',
          'No contacts are read from your phone, no health records are held, and there is no '
              'advertising or analytics of any kind.',
        ]),
        const _Section('Who sees it', <String>[
          'The people in an elder\'s care circle see the elder\'s details and each other\'s '
              'numbers, so they can reach one another in an emergency.',
          'An emergency responder sees an emergency when the circle asks for one.',
          'A community volunteer is told who and where only if the elder agreed to volunteer '
              'help, only after they say they will go, and only while the emergency is open.',
          'Administrators can read records to keep the service running, but cannot act on a '
              'live emergency.',
          vitalInterestsSentence,
        ]),
        const _Section('Services that handle it for us', <String>[
          'Google Firebase delivers alerts to phones. Africa\'s Talking sends text messages, '
              'so it receives phone numbers and the message. LiveKit carries the sound of '
              'calls inside the app and records none of it. OpenStreetMap services find an '
              'address you search for and work out travel times from two points on a map.',
          'Some of these services run outside Kenya.',
        ]),
        _Section('How long it is kept', <String>[
          retentionSentence(facts),
          'Accounts are kept while they are in use. A closed account is kept, without being '
              'able to sign in, because it is named in emergencies that have to stay readable.',
        ]),
        const _Section('Your choices', <String>[
          'Change your name, email or phone number on your account page.',
          'See what was agreed and withdraw it on the Privacy and consent page. Location, '
              'contact sharing and volunteer help can be agreed to again later.',
          'Ask for a copy of what is held about you, or for it to be deleted, through the '
              'contact below. You can also complain to the Office of the Data Protection '
              'Commissioner.',
        ]),
        _Section('Who to ask', <String>[_contactLine(facts)]),
      ],
    );
  }
}

/// The terms of use: what MzaziCare is, what it is not, and what is asked of the
/// people using it.
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _LegalPage(
      title: 'Terms of use',
      version: (LegalFacts facts) => facts.termsVersion,
      sections: (LegalFacts? facts) => <_Section>[
        const _Section('Not a replacement for 999 or 112', <String>[
          'MzaziCare asks the people who look after you. It is not an ambulance, the police '
              'or the fire service. In danger, call 999 or 112 as well.',
        ]),
        const _Section('What it depends on', <String>[
          'A phone that is on, signed in, charged and connected. Alerts travel over the '
              'internet and by text message, and either can be delayed or fail.',
          'People answering. MzaziCare keeps asking, in order, but cannot promise that '
              'anybody will be free.',
          'Community volunteers are members of the public whose details an administrator '
              'checked. They are not medical professionals.',
        ]),
        const _Section('What is asked of you', <String>[
          'Use the help button for real need. A mistaken press can be cancelled.',
          'Add somebody to a care circle only with their agreement, and keep the details '
              'you give true and up to date.',
          'Keep your sign-in to yourself. A code from a caregiver is for the elder\'s own '
              'phone.',
          'Treat what you learn about another person in an emergency as private.',
        ]),
        const _Section('Accounts', <String>[
          'An administrator may close an account that is misused. A closed account cannot '
              'sign in and is never sent an emergency.',
        ]),
        _Section('Questions', <String>[_contactLine(facts)]),
      ],
    );
  }
}

String _contactLine(LegalFacts? facts) {
  final DataContact? contact = facts?.contact;
  if (contact == null) {
    return facts == null
        ? 'The contact for this service could not be loaded. Try again with a connection.'
        : 'No contact has been set for this server yet. Ask the person who set MzaziCare up '
              'for you.';
  }
  return <String?>[contact.name, contact.email, contact.address]
      .whereType<String>()
      .where((String part) => part.trim().isNotEmpty)
      .join('\n');
}

class _Section {
  const _Section(this.heading, this.paragraphs);

  final String heading;
  final List<String> paragraphs;
}

class _LegalPage extends StatefulWidget {
  const _LegalPage({required this.title, required this.version, required this.sections});

  final String title;
  final String Function(LegalFacts facts) version;
  final List<_Section> Function(LegalFacts? facts) sections;

  @override
  State<_LegalPage> createState() => _LegalPageState();
}

class _LegalPageState extends State<_LegalPage> {
  LegalFacts? _facts;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  /// The page reads in full without the server: only the figures and the contact wait
  /// for it, and say so in general terms when they cannot be had.
  Future<void> _load() async {
    try {
      final LegalFacts facts = await context.read<AuthController>().legal();
      if (mounted) setState(() => _facts = facts);
    } on Exception {
      // The general wording stays.
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final LegalFacts? facts = _facts;

    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        // A scroll view over one column rather than a list, so the whole notice is laid
        // out at once: it is short and fixed, a screen reader can move through all of it,
        // and the last section (who to ask) exists before anybody scrolls to it.
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            MzaziLayout.margin(context),
            MzaziSpace.s8,
            MzaziLayout.margin(context),
            MzaziSpace.s32,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              for (final _Section section in widget.sections(facts)) ...<Widget>[
                SectionLabel(section.heading),
                const SizedBox(height: MzaziSpace.s8),
                for (final String paragraph in section.paragraphs) ...<Widget>[
                  Text(paragraph, style: theme.textTheme.bodyLarge),
                  const SizedBox(height: MzaziSpace.s12),
                ],
                const SizedBox(height: MzaziSpace.s16),
              ],
              if (facts != null)
                Text('Version ${widget.version(facts)}', style: theme.textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

/// The two links, side by side, for the foot of any page that needs them.
class LegalLinks extends StatelessWidget {
  const LegalLinks({this.quiet = false, super.key});

  /// In small print, in the softer ink: for a screen where few people open them and the
  /// form above is what matters. Still a full touch target each.
  final bool quiet;

  static Future<void> _open(BuildContext context, Widget screen) =>
      Navigator.of(context).push<void>(MaterialPageRoute<void>(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ButtonStyle? style = quiet
        ? TextButton.styleFrom(
            foregroundColor: theme.colorScheme.onSurfaceVariant,
            textStyle: theme.textTheme.bodySmall?.copyWith(decoration: TextDecoration.underline),
          )
        : null;

    return Wrap(
      spacing: MzaziSpace.s8,
      children: <Widget>[
        TextButton(
          style: style,
          onPressed: () => unawaited(_open(context, const PrivacyNoticeScreen())),
          child: const Text('Privacy notice'),
        ),
        TextButton(
          style: style,
          onPressed: () => unawaited(_open(context, const TermsScreen())),
          child: const Text('Terms of use'),
        ),
      ],
    );
  }
}
