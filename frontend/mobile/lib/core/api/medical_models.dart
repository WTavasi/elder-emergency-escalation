import 'models.dart';

/// Somebody named in the record of changes and looks.
class MedicalPerson {
  const MedicalPerson({required this.id, required this.name, required this.role});

  final String id;
  final String name;
  final Role? role;

  static MedicalPerson? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final Object? id = json['id'];
    final Object? name = json['name'];
    if (id is! String || name is! String) return null;
    final Object? role = json['role'];
    Role? parsed;
    if (role is String) {
      try {
        parsed = Role.parse(role);
      } on FormatException {
        parsed = null;
      }
    }
    return MedicalPerson(id: id, name: name, role: parsed);
  }
}

/// One thing a responder should know at a glance, ticked rather than typed.
class MedicalOption {
  const MedicalOption({required this.flag, required this.label});

  final String flag;
  final String label;
}

/// What is kept about an elder's health. Every part may be empty.
class MedicalDetails {
  const MedicalDetails({
    this.dateOfBirth,
    this.bloodType,
    this.flags = const <String>[],
    this.conditions,
    this.medications,
    this.allergies,
    this.languages,
    this.doctorName,
    this.doctorPhone,
    this.hospital,
    this.notes,
  });

  /// YYYY-MM-DD.
  final String? dateOfBirth;
  final String? bloodType;
  final List<String> flags;
  final String? conditions;
  final String? medications;
  final String? allergies;
  final String? languages;
  final String? doctorName;
  final String? doctorPhone;
  final String? hospital;
  final String? notes;

  static const MedicalDetails empty = MedicalDetails();

  bool get isEmpty =>
      dateOfBirth == null &&
      bloodType == null &&
      flags.isEmpty &&
      conditions == null &&
      medications == null &&
      allergies == null &&
      languages == null &&
      doctorName == null &&
      doctorPhone == null &&
      hospital == null &&
      notes == null;

  static MedicalDetails? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    String? text(String key) {
      final Object? value = json[key];
      return value is String && value.trim().isNotEmpty ? value : null;
    }

    final Object? flags = json['flags'];
    return MedicalDetails(
      dateOfBirth: text('dateOfBirth'),
      bloodType: text('bloodType'),
      flags: flags is List<Object?> ? flags.whereType<String>().toList() : const <String>[],
      conditions: text('conditions'),
      medications: text('medications'),
      allergies: text('allergies'),
      languages: text('languages'),
      doctorName: text('doctorName'),
      doctorPhone: text('doctorPhone'),
      hospital: text('hospital'),
      notes: text('notes'),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'dateOfBirth': dateOfBirth,
    'bloodType': bloodType,
    'flags': flags,
    'conditions': conditions,
    'medications': medications,
    'allergies': allergies,
    'languages': languages,
    'doctorName': doctorName,
    'doctorPhone': doctorPhone,
    'hospital': hospital,
    'notes': notes,
  };
}

/// Which parts of the details a change touched, as people say them.
const Map<String, String> medicalFieldNames = <String, String>{
  'dateOfBirth': 'date of birth',
  'bloodType': 'blood type',
  'flags': 'conditions and needs',
  'conditions': 'other conditions',
  'medications': 'medicines',
  'allergies': 'allergies',
  'languages': 'languages',
  'doctorName': 'doctor',
  'doctorPhone': "doctor's number",
  'hospital': 'hospital',
  'notes': 'notes',
};

class MedicalChange {
  const MedicalChange({required this.by, required this.fields, required this.at});

  final MedicalPerson? by;
  final List<String> fields;
  final DateTime at;
}

class MedicalView {
  const MedicalView({required this.by, required this.eventId, required this.at});

  final MedicalPerson? by;
  final String? eventId;
  final DateTime at;
}

/// The elder's medical details as the elder and their caregivers see and change them.
class MedicalProfilePage {
  const MedicalProfilePage({
    required this.elderId,
    required this.elderName,
    required this.enabled,
    required this.consentActive,
    required this.consentByElder,
    required this.details,
    required this.age,
    required this.updatedAt,
    required this.updatedBy,
    required this.canEdit,
    required this.flagOptions,
    required this.bloodTypes,
    required this.changes,
    required this.views,
  });

  final String elderId;
  final String elderName;

  /// Whether this server can keep medical details at all.
  final bool enabled;

  /// Agreed by somebody: details may be kept.
  final bool consentActive;

  /// The elder agreed themselves: those asked about an alert see them.
  final bool consentByElder;
  final MedicalDetails? details;
  final int? age;
  final DateTime? updatedAt;
  final MedicalPerson? updatedBy;
  final bool canEdit;
  final List<MedicalOption> flagOptions;
  final List<String> bloodTypes;
  final List<MedicalChange> changes;
  final List<MedicalView> views;

  String labelOf(String flag) =>
      flagOptions.where((MedicalOption o) => o.flag == flag).firstOrNull?.label ?? flag;

  factory MedicalProfilePage.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> consent =
        json['consent'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final Map<String, dynamic> options =
        json['options'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final List<Object?> flags = options['flags'] as List<Object?>? ?? const <Object?>[];
    final List<Object?> changes = json['changes'] as List<Object?>? ?? const <Object?>[];
    final List<Object?> views = json['views'] as List<Object?>? ?? const <Object?>[];

    return MedicalProfilePage(
      elderId: json['elderId'] as String,
      elderName: json['elderName'] as String? ?? '',
      enabled: json['enabled'] as bool? ?? false,
      consentActive: consent['active'] as bool? ?? false,
      consentByElder: consent['byElder'] as bool? ?? false,
      details: MedicalDetails.fromJson(json['details']),
      age: (json['age'] as num?)?.toInt(),
      updatedAt: _when(json['updatedAt']),
      updatedBy: MedicalPerson.fromJson(json['updatedBy']),
      canEdit: json['canEdit'] as bool? ?? false,
      flagOptions: <MedicalOption>[
        for (final Object? item in flags)
          if (item is Map<String, dynamic> && item['flag'] is String && item['label'] is String)
            MedicalOption(flag: item['flag'] as String, label: item['label'] as String),
      ],
      bloodTypes: (options['bloodTypes'] as List<Object?>? ?? const <Object?>[])
          .whereType<String>()
          .toList(),
      changes: <MedicalChange>[
        for (final Object? item in changes)
          if (item is Map<String, dynamic> && _when(item['at']) != null)
            MedicalChange(
              by: MedicalPerson.fromJson(item['by']),
              fields: (item['fields'] as List<Object?>? ?? const <Object?>[])
                  .whereType<String>()
                  .toList(),
              at: _when(item['at'])!,
            ),
      ],
      views: <MedicalView>[
        for (final Object? item in views)
          if (item is Map<String, dynamic> && _when(item['at']) != null)
            MedicalView(
              by: MedicalPerson.fromJson(item['by']),
              eventId: item['eventId'] as String?,
              at: _when(item['at'])!,
            ),
      ],
    );
  }
}

/// Why the details are, or are not, on an alert.
enum AlertMedicalStatus {
  shown,

  /// Nothing saved.
  none,

  /// The elder has not agreed to share them.
  notShared,

  /// The alert is over.
  closed,

  /// This person has not been asked to help yet.
  notAsked,

  /// This server keeps no medical details.
  off;

  static AlertMedicalStatus parse(Object? value) => switch (value) {
    'shown' => AlertMedicalStatus.shown,
    'none' => AlertMedicalStatus.none,
    'not-shared' => AlertMedicalStatus.notShared,
    'closed' => AlertMedicalStatus.closed,
    'not-asked' => AlertMedicalStatus.notAsked,
    _ => AlertMedicalStatus.off,
  };
}

/// One ticked item, with what it means for this emergency when it means something.
class MedicalHighlight {
  const MedicalHighlight({
    required this.flag,
    required this.label,
    required this.why,
    required this.serious,
  });

  final String flag;
  final String label;
  final String? why;
  final bool serious;
}

/// The elder's medical details on an alert, read against what is happening.
class AlertMedical {
  const AlertMedical({
    required this.status,
    required this.details,
    required this.age,
    required this.highlights,
    required this.serious,
    required this.askFor,
  });

  final AlertMedicalStatus status;
  final MedicalDetails? details;
  final int? age;
  final List<MedicalHighlight> highlights;

  /// The history makes this emergency more serious than it looks.
  final bool serious;

  /// The service to ask because of it.
  final ResponderService? askFor;

  factory AlertMedical.fromJson(Map<String, dynamic> json) => AlertMedical(
    status: AlertMedicalStatus.parse(json['status']),
    details: MedicalDetails.fromJson(json['details']),
    age: (json['age'] as num?)?.toInt(),
    highlights: <MedicalHighlight>[
      for (final Object? item in json['highlights'] as List<Object?>? ?? const <Object?>[])
        if (item is Map<String, dynamic> && item['flag'] is String && item['label'] is String)
          MedicalHighlight(
            flag: item['flag'] as String,
            label: item['label'] as String,
            why: item['why'] as String?,
            serious: item['serious'] as bool? ?? false,
          ),
    ],
    serious: json['serious'] as bool? ?? false,
    askFor: ResponderService.parse(json['askFor']),
  );
}

DateTime? _when(Object? value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;
