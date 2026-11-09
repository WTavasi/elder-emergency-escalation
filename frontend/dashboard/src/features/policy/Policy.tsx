import { useCallback, useState, type ReactNode } from 'react';
import { ApiError, api } from '../../shared/api/client';
import type {
  Policy as PolicyData,
  PolicyChange,
  PolicyFactor,
  PolicyRule,
  Role,
  Severity,
} from '../../shared/api/types';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorNotice, Skeleton } from '../../shared/components/parts';
import { useLoader } from '../../shared/hooks/useLoader';
import { formatClock, severityWord } from '../../shared/utils/format';

const WHO: Partial<Record<Role, string>> = {
  CAREGIVER: 'Caregivers',
  FAMILY_MEMBER: 'Family',
  EMERGENCY_RESPONDER: 'Emergency services',
};

const SEVERITIES: Severity[] = ['STANDARD', 'ELEVATED', 'CRITICAL'];

/** The parts of the page that save on their own. */
type Area = 'rules' | 'weights' | 'bands';

/** "CRITICAL tier 1: time limit 60 s → 45 s", for the list of changes. */
function describeChange(change: PolicyChange, labels: Record<string, string>): string {
  const before = change.before ?? {};
  const after = change.after;
  const parts: string[] = [];
  const word = (key: string, value: unknown): string => {
    if (value === null) return 'none';
    if (key === 'timeoutSeconds') return `${String(value)} s`;
    if (key === 'dispatchMode') return value === 'PARALLEL' ? 'with the tier before' : 'in turn';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    return String(value);
  };
  const names: Record<string, string> = {
    timeoutSeconds: 'time limit',
    dispatchMode: 'asked',
    smsFallbackImmediate: 'text at once',
    weight: 'weight',
    enabled: 'counts',
    elevatedFrom: 'High from',
    criticalFrom: 'Critical from',
  };
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    parts.push(
      `${names[key] ?? key} ${before[key] === undefined ? '' : `${word(key, before[key])} → `}${word(key, after[key])}`,
    );
  }
  const target =
    change.area === 'escalation_rule'
      ? change.target.replace(/^(\w+)/, (band) => severityWord(band))
      : change.area === 'severity_band'
        ? 'Bands'
        : (labels[change.target] ?? change.target);
  return `${target}: ${parts.join(', ')}`;
}

/**
 * The escalation policy, for administrators: how long each tier is given and how it is
 * asked, the weights behind a severity score, and the scores at which each band starts.
 *
 * Each row saves on its own. The server checks every change against what keeps the
 * system working, records who made it, and uses it from the next alert or tier; an
 * alert already waiting keeps its current deadline.
 */
export function Policy() {
  const fetcher = useCallback(() => api.escalationPolicy.get(), []);
  const { data, error, loading, reload } = useLoader<PolicyData>(
    fetcher,
    'Could not load the policy.',
  );
  // What the last save answered with, which is the policy as it now stands; until a save,
  // what was loaded.
  const [saved, setSaved] = useState<PolicyData | null>(null);
  const policy = saved ?? data;
  // What the last save said, shown in the section that was saved, where the eye already is.
  const [outcome, setOutcome] = useState<{ area: Area; ok: boolean; text: string } | null>(null);

  async function save(
    area: Area,
    change: () => Promise<PolicyData>,
    done: string,
  ): Promise<boolean> {
    setOutcome(null);
    try {
      setSaved(await change());
      setOutcome({ area, ok: true, text: `${done} It applies from the next alert.` });
      return true;
    } catch (caught) {
      setOutcome({
        area,
        ok: false,
        text: caught instanceof ApiError ? caught.message : 'Could not save. Try again.',
      });
      return false;
    }
  }

  const said = (area: Area) =>
    outcome?.area !== area ? null : outcome.ok ? (
      <p className="notice" role="status">
        {outcome.text}
      </p>
    ) : (
      <ErrorNotice message={outcome.text} />
    );
  const labels = Object.fromEntries(
    (policy?.severityFactors ?? []).map((factor) => [factor.key, factor.label]),
  );

  return (
    <>
      <PageHeader title="Escalation policy">
        <p>
          How long each person is given before the next is asked, and how severe an alert is judged.
          Changes are checked, recorded with your name, and used from the next alert.
        </p>
      </PageHeader>

      {loading && !policy ? (
        <Skeleton rows={6} />
      ) : error && !policy ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : policy ? (
        <div className="stack">
          <section className="card stack" aria-labelledby="rules-heading">
            <h2 id="rules-heading">Who is asked, and for how long</h2>
            <p className="micro muted">
              Each severity has its own chain. A time limit runs from when a tier is asked; when it
              passes with nobody coming, the next tier is asked. The last tier has no limit. Between{' '}
              {policy.limits.timeoutSeconds.min} and {policy.limits.timeoutSeconds.max} seconds.
            </p>
            {said('rules')}
            {SEVERITIES.map((severity) => (
              <table className="list policy-table" key={severity}>
                <caption>{severityWord(severity)} alerts</caption>
                <thead>
                  <tr>
                    <th scope="col">Tier</th>
                    <th scope="col">Time limit</th>
                    <th scope="col">Asked</th>
                    <th scope="col">Text at once</th>
                    <th scope="col">
                      <span className="visually-hidden">Save</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {policy.escalationRules
                    .filter((rule) => rule.severity === severity)
                    .map((rule) => (
                      <RuleRow
                        key={`${rule.severity}-${rule.tier}-${rule.updatedAt}`}
                        rule={rule}
                        limits={policy.limits.timeoutSeconds}
                        onSave={(change) =>
                          save(
                            'rules',
                            () => api.escalationPolicy.updateRule(rule.severity, rule.tier, change),
                            `${severityWord(rule.severity)} tier ${rule.tier} saved.`,
                          )
                        }
                      />
                    ))}
                </tbody>
              </table>
            ))}
          </section>

          <section className="card stack" aria-labelledby="weights-heading">
            <h2 id="weights-heading">What makes an alert more severe</h2>
            <p className="micro muted">
              Each factor that applies adds its weight to the score. The highest score an alert can
              reach now is <span className="figures">{policy.maxScore}</span>.
            </p>
            {said('weights')}
            <table className="list policy-table">
              <thead>
                <tr>
                  <th scope="col">Factor</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Counts</th>
                  <th scope="col">
                    <span className="visually-hidden">Save</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {policy.severityFactors.map((factor) => (
                  <FactorRow
                    key={`${factor.key}-${factor.updatedAt}`}
                    factor={factor}
                    limits={policy.limits.weight}
                    onSave={(change) =>
                      save(
                        'weights',
                        () => api.escalationPolicy.updateFactor(factor.key, change),
                        `${factor.label} saved.`,
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </section>

          <Bands
            key={`${policy.bands.elevatedFrom}-${policy.bands.criticalFrom}`}
            policy={policy}
            said={said('bands')}
            onSave={(bands) =>
              save('bands', () => api.escalationPolicy.updateBands(bands), 'Bands saved.')
            }
          />

          <section className="card stack" aria-labelledby="changes-heading">
            <h2 id="changes-heading">Changes</h2>
            {policy.changes.length === 0 ? (
              <p className="muted">Nobody has changed the policy yet.</p>
            ) : (
              <ol className="plain-list">
                {policy.changes.map((change) => (
                  <li key={change.id}>
                    <span>{describeChange(change, labels)}</span>
                    <span className="micro muted">
                      {' '}
                      {change.by?.name ?? 'Someone who has since left'},{' '}
                      <span className="figures">{formatClock(change.at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function RuleRow({
  rule,
  limits,
  onSave,
}: {
  rule: PolicyRule;
  limits: { min: number; max: number };
  onSave: (
    change: Partial<Pick<PolicyRule, 'timeoutSeconds' | 'dispatchMode' | 'smsFallbackImmediate'>>,
  ) => Promise<boolean>;
}) {
  const [timeout, setTimeoutValue] = useState(String(rule.timeoutSeconds ?? ''));
  const [parallel, setParallel] = useState(rule.dispatchMode === 'PARALLEL');
  const [textAtOnce, setTextAtOnce] = useState(rule.smsFallbackImmediate);
  const [busy, setBusy] = useState(false);
  const id = `${rule.severity}-${rule.tier}`;
  const who = WHO[rule.responderRole] ?? rule.responderRole;

  const changed =
    (!rule.last && timeout !== String(rule.timeoutSeconds)) ||
    parallel !== (rule.dispatchMode === 'PARALLEL') ||
    textAtOnce !== rule.smsFallbackImmediate;

  async function submit() {
    setBusy(true);
    await onSave({
      ...(rule.last ? {} : { timeoutSeconds: Number(timeout) }),
      dispatchMode: parallel ? 'PARALLEL' : 'SEQUENTIAL',
      smsFallbackImmediate: textAtOnce,
    });
    setBusy(false);
  }

  return (
    <tr>
      <th scope="row">
        <span className="figures">{rule.tier}.</span> {who}
      </th>
      <td>
        {rule.last ? (
          <span className="muted">End of the chain</span>
        ) : (
          <label htmlFor={`timeout-${id}`} className="inline-field">
            <input
              id={`timeout-${id}`}
              className="figures policy-number"
              type="number"
              inputMode="numeric"
              min={limits.min}
              max={limits.max}
              value={timeout}
              aria-label={`${severityWord(rule.severity)} tier ${rule.tier} time limit in seconds`}
              onChange={(event) => setTimeoutValue(event.target.value)}
            />{' '}
            seconds
          </label>
        )}
      </td>
      <td>
        {rule.tier === 1 ? (
          <span className="muted">First</span>
        ) : (
          <select
            aria-label={`How ${severityWord(rule.severity)} tier ${rule.tier} is asked`}
            value={parallel ? 'PARALLEL' : 'SEQUENTIAL'}
            onChange={(event) => setParallel(event.target.value === 'PARALLEL')}
          >
            <option value="SEQUENTIAL">After the tier before</option>
            <option value="PARALLEL">With the tier before</option>
          </select>
        )}
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={`Text ${severityWord(rule.severity)} tier ${rule.tier} at once`}
          checked={textAtOnce}
          onChange={(event) => setTextAtOnce(event.target.checked)}
        />
      </td>
      <td>
        <button
          type="button"
          className="button--quiet"
          disabled={!changed || busy}
          onClick={() => void submit()}
        >
          Save
        </button>
      </td>
    </tr>
  );
}

function FactorRow({
  factor,
  limits,
  onSave,
}: {
  factor: PolicyFactor;
  limits: { min: number; max: number };
  onSave: (change: Partial<Pick<PolicyFactor, 'weight' | 'enabled'>>) => Promise<boolean>;
}) {
  const [weight, setWeight] = useState(String(factor.weight));
  const [enabled, setEnabled] = useState(factor.enabled);
  const [busy, setBusy] = useState(false);
  const changed = weight !== String(factor.weight) || enabled !== factor.enabled;

  async function submit() {
    setBusy(true);
    await onSave({ weight: Number(weight), enabled });
    setBusy(false);
  }

  return (
    <tr>
      <th scope="row">
        {factor.label}
        {factor.description ? (
          <span className="micro muted block">{factor.description}</span>
        ) : null}
        {!factor.measured ? (
          <span className="micro muted block">This version cannot measure it.</span>
        ) : null}
      </th>
      <td>
        <input
          className="figures policy-number"
          type="number"
          inputMode="numeric"
          min={limits.min}
          max={limits.max}
          value={weight}
          disabled={!factor.measured}
          aria-label={`${factor.label} weight`}
          onChange={(event) => setWeight(event.target.value)}
        />
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={`${factor.label} counts`}
          checked={enabled}
          disabled={!factor.measured}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </td>
      <td>
        <button
          type="button"
          className="button--quiet"
          disabled={!changed || busy || !factor.measured}
          onClick={() => void submit()}
        >
          Save
        </button>
      </td>
    </tr>
  );
}

function Bands({
  policy,
  said,
  onSave,
}: {
  policy: PolicyData;
  said: ReactNode;
  onSave: (bands: { elevatedFrom: number; criticalFrom: number }) => Promise<boolean>;
}) {
  const [elevated, setElevated] = useState(String(policy.bands.elevatedFrom));
  const [critical, setCritical] = useState(String(policy.bands.criticalFrom));
  const [busy, setBusy] = useState(false);
  const changed =
    elevated !== String(policy.bands.elevatedFrom) ||
    critical !== String(policy.bands.criticalFrom);
  const { min, max } = policy.limits.threshold;

  async function submit() {
    setBusy(true);
    await onSave({ elevatedFrom: Number(elevated), criticalFrom: Number(critical) });
    setBusy(false);
  }

  return (
    <section className="card stack" aria-labelledby="bands-heading">
      <h2 id="bands-heading">Where each band starts</h2>
      <p className="micro muted">
        A score below High is Standard. Each band has its own chain above.{' '}
        {policy.bands.fromConfiguration
          ? 'These are still the values the server was started with.'
          : `Set by ${policy.bands.setBy?.name ?? 'someone who has since left'}, ${policy.bands.setAt ? formatClock(policy.bands.setAt) : ''}.`}
      </p>
      {said}
      <div className="form-grid">
        <label htmlFor="band-elevated">High from</label>
        <input
          id="band-elevated"
          className="figures policy-number"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={elevated}
          onChange={(event) => setElevated(event.target.value)}
        />
        <label htmlFor="band-critical">Critical from</label>
        <input
          id="band-critical"
          className="figures policy-number"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={critical}
          onChange={(event) => setCritical(event.target.value)}
        />
      </div>
      <div>
        <button
          type="button"
          className="button--quiet"
          disabled={!changed || busy}
          onClick={() => void submit()}
        >
          Save bands
        </button>
      </div>
    </section>
  );
}
