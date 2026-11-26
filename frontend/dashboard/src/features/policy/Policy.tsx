import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { Toast } from '../../shared/components/Toast';
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

type RuleDraft = { timeout: string; parallel: boolean; textAtOnce: boolean };
type FactorDraft = { weight: string; enabled: boolean };
type Drafts = {
  rules: Record<string, RuleDraft>;
  factors: Record<string, FactorDraft>;
  bands: { elevated: string; critical: string };
};

const ruleId = (rule: Pick<PolicyRule, 'severity' | 'tier'>) => `${rule.severity}-${rule.tier}`;

/** What every field shows before anybody edits it: the policy as it stands. */
function draftsFrom(policy: PolicyData): Drafts {
  return {
    rules: Object.fromEntries(
      policy.escalationRules.map((rule) => [
        ruleId(rule),
        {
          timeout: String(rule.timeoutSeconds ?? ''),
          parallel: rule.dispatchMode === 'PARALLEL',
          textAtOnce: rule.smsFallbackImmediate,
        },
      ]),
    ),
    factors: Object.fromEntries(
      policy.severityFactors.map((factor) => [
        factor.key,
        { weight: String(factor.weight), enabled: factor.enabled },
      ]),
    ),
    bands: {
      elevated: String(policy.bands.elevatedFrom),
      critical: String(policy.bands.criticalFrom),
    },
  };
}

function ruleChanged(rule: PolicyRule, draft: RuleDraft | undefined): boolean {
  if (!draft) return false;
  return (
    (!rule.last && draft.timeout !== String(rule.timeoutSeconds)) ||
    draft.parallel !== (rule.dispatchMode === 'PARALLEL') ||
    draft.textAtOnce !== rule.smsFallbackImmediate
  );
}

function factorChanged(factor: PolicyFactor, draft: FactorDraft | undefined): boolean {
  if (!draft || !factor.measured) return false;
  return draft.weight !== String(factor.weight) || draft.enabled !== factor.enabled;
}

/** One edit waiting to be saved: where it is, what to call it, and the call that saves it. */
type Edit = { area: Area; label: string; send: () => Promise<PolicyData> };

/**
 * The escalation policy, for administrators: how long each tier is given and how it is
 * asked, the weights behind a severity score, and the scores at which each band starts.
 *
 * Edits are gathered rather than saved one row at a time. Once anything is edited, a bar
 * floats at the foot of the window with how many changes are waiting, Discard and Save
 * changes: one place to commit, in the same spot every time, and nothing on the page
 * moves to make room for it. Each changed row says "Edited" until it is saved.
 *
 * The server checks every change against what keeps the system working, records who made
 * it, and uses it from the next alert or tier; an alert already waiting keeps its current
 * deadline. A refused change is explained in its own section, where the field is.
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
  // What each field shows, starting from the policy once it has loaded. Adjusted while
  // rendering, React's own pattern for state that follows other state.
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  if (policy && drafts === null) setDrafts(draftsFrom(policy));
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ area: Area; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const edits: Edit[] = [];
  if (policy && drafts) {
    for (const rule of policy.escalationRules) {
      const draft = drafts.rules[ruleId(rule)];
      if (!draft || !ruleChanged(rule, draft)) continue;
      edits.push({
        area: 'rules',
        label: `${severityWord(rule.severity)} tier ${rule.tier}`,
        send: () =>
          api.escalationPolicy.updateRule(rule.severity, rule.tier, {
            ...(rule.last ? {} : { timeoutSeconds: Number(draft.timeout) }),
            dispatchMode: draft.parallel ? 'PARALLEL' : 'SEQUENTIAL',
            smsFallbackImmediate: draft.textAtOnce,
          }),
      });
    }
    for (const factor of policy.severityFactors) {
      const draft = drafts.factors[factor.key];
      if (!draft || !factorChanged(factor, draft)) continue;
      edits.push({
        area: 'weights',
        label: factor.label,
        send: () =>
          api.escalationPolicy.updateFactor(factor.key, {
            weight: Number(draft.weight),
            enabled: draft.enabled,
          }),
      });
    }
    if (
      drafts.bands.elevated !== String(policy.bands.elevatedFrom) ||
      drafts.bands.critical !== String(policy.bands.criticalFrom)
    ) {
      edits.push({
        area: 'bands',
        label: 'The bands',
        send: () =>
          api.escalationPolicy.updateBands({
            elevatedFrom: Number(drafts.bands.elevated),
            criticalFrom: Number(drafts.bands.critical),
          }),
      });
    }
  }
  const waiting = edits.length;

  // Leaving the page with edits not saved asks first, as a Mac app does on closing.
  useEffect(() => {
    if (waiting === 0) return;
    const onLeave = (leaveEvent: BeforeUnloadEvent) => leaveEvent.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [waiting]);

  /**
   * Saves each edit in turn, the server answering each with the policy as it now stands.
   * A refusal stops there: what was saved before it stays saved, and the refused edit
   * and any after it stay in their fields, still marked, to be fixed and saved again.
   */
  async function saveAll() {
    setBusy(true);
    setRefusal(null);
    let done = 0;
    let latest: PolicyData | null = null;
    for (const edit of edits) {
      try {
        latest = await edit.send();
        setSaved(latest);
        done += 1;
      } catch (caught) {
        setRefusal({
          area: edit.area,
          text: `${edit.label} could not be saved. ${
            caught instanceof ApiError ? caught.message : 'Could not save. Try again.'
          }`,
        });
        break;
      }
    }
    if (done === edits.length) {
      // Every field from the policy as the server now has it, in its own words.
      if (latest) setDrafts(draftsFrom(latest));
      setToast(
        `${done === 1 ? `${edits[0]!.label} saved.` : `${done} changes saved.`} They apply from the next alert.`,
      );
    }
    setBusy(false);
  }

  function discard() {
    if (policy) setDrafts(draftsFrom(policy));
    setRefusal(null);
  }

  const refused = (area: Area) =>
    refusal?.area === area ? <ErrorNotice message={refusal.text} /> : null;
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
      ) : policy && drafts ? (
        <div className="stack">
          <section className="card stack" aria-labelledby="rules-heading">
            <h2 id="rules-heading">Who is asked, and for how long</h2>
            <p className="micro muted measure">
              Each severity has its own chain. A time limit runs from when a tier is asked; when it
              passes with nobody coming, the next tier is asked. The last tier has no limit. Between{' '}
              {policy.limits.timeoutSeconds.min} and {policy.limits.timeoutSeconds.max} seconds.
            </p>
            {refused('rules')}
            {SEVERITIES.map((severity) => (
              <table className="list policy-table" key={severity}>
                <caption>{severityWord(severity)} alerts</caption>
                <thead>
                  <tr>
                    <th scope="col">Tier</th>
                    <th scope="col">Time limit</th>
                    <th scope="col">Asked</th>
                    <th scope="col">Text at once</th>
                  </tr>
                </thead>
                <tbody>
                  {policy.escalationRules
                    .filter((rule) => rule.severity === severity)
                    .map((rule) => (
                      <RuleRow
                        key={ruleId(rule)}
                        rule={rule}
                        draft={drafts.rules[ruleId(rule)]!}
                        limits={policy.limits.timeoutSeconds}
                        onChange={(draft) =>
                          setDrafts({
                            ...drafts,
                            rules: { ...drafts.rules, [ruleId(rule)]: draft },
                          })
                        }
                      />
                    ))}
                </tbody>
              </table>
            ))}
          </section>

          <section className="card stack" aria-labelledby="weights-heading">
            <h2 id="weights-heading">What makes an alert more severe</h2>
            <p className="micro muted measure">
              Each factor that applies adds its weight to the score. The highest score an alert can
              reach now is <span className="figures">{policy.maxScore}</span>.
            </p>
            {refused('weights')}
            <table className="list policy-table">
              <thead>
                <tr>
                  <th scope="col">Factor</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Counts</th>
                </tr>
              </thead>
              <tbody>
                {policy.severityFactors.map((factor) => (
                  <FactorRow
                    key={factor.key}
                    factor={factor}
                    draft={drafts.factors[factor.key]!}
                    limits={policy.limits.weight}
                    onChange={(draft) =>
                      setDrafts({
                        ...drafts,
                        factors: { ...drafts.factors, [factor.key]: draft },
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </section>

          <Bands
            policy={policy}
            draft={drafts.bands}
            refused={refused('bands')}
            onChange={(bands) => setDrafts({ ...drafts, bands })}
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

      {waiting > 0 ? (
        <div className="floating-bar" role="region" aria-label="Unsaved changes">
          <strong aria-live="polite">
            {waiting === 1 ? '1 unsaved change' : `${waiting} unsaved changes`}
          </strong>
          <button type="button" className="button--quiet" disabled={busy} onClick={discard}>
            Discard
          </button>
          <button
            type="button"
            className="button--ink"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void saveAll()}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : toast ? (
        <Toast message={toast} onClose={() => setToast(null)} />
      ) : null}
    </>
  );
}

/** "Edited", beside a row changed and not saved yet: in words, not only a colour. */
function Edited({ shown }: { shown: boolean }) {
  return shown ? <span className="edited">Edited</span> : null;
}

function RuleRow({
  rule,
  draft,
  limits,
  onChange,
}: {
  rule: PolicyRule;
  draft: RuleDraft;
  limits: { min: number; max: number };
  onChange: (draft: RuleDraft) => void;
}) {
  const id = ruleId(rule);
  const who = WHO[rule.responderRole] ?? rule.responderRole;
  const changed = ruleChanged(rule, draft);

  return (
    <tr className={changed ? 'policy-row--edited' : undefined}>
      <th scope="row">
        <span className="figures">{rule.tier}.</span> {who} <Edited shown={changed} />
      </th>
      <td data-label="Time limit">
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
              value={draft.timeout}
              aria-label={`${severityWord(rule.severity)} tier ${rule.tier} time limit in seconds`}
              onChange={(event) => onChange({ ...draft, timeout: event.target.value })}
            />{' '}
            seconds
          </label>
        )}
      </td>
      <td data-label="Asked">
        {rule.tier === 1 ? (
          <span className="muted">First</span>
        ) : (
          <select
            aria-label={`How ${severityWord(rule.severity)} tier ${rule.tier} is asked`}
            value={draft.parallel ? 'PARALLEL' : 'SEQUENTIAL'}
            onChange={(event) =>
              onChange({ ...draft, parallel: event.target.value === 'PARALLEL' })
            }
          >
            <option value="SEQUENTIAL">After the tier before</option>
            <option value="PARALLEL">With the tier before</option>
          </select>
        )}
      </td>
      <td data-label="Text at once">
        <input
          type="checkbox"
          aria-label={`Text ${severityWord(rule.severity)} tier ${rule.tier} at once`}
          checked={draft.textAtOnce}
          onChange={(event) => onChange({ ...draft, textAtOnce: event.target.checked })}
        />
      </td>
    </tr>
  );
}

function FactorRow({
  factor,
  draft,
  limits,
  onChange,
}: {
  factor: PolicyFactor;
  draft: FactorDraft;
  limits: { min: number; max: number };
  onChange: (draft: FactorDraft) => void;
}) {
  const changed = factorChanged(factor, draft);

  return (
    <tr className={changed ? 'policy-row--edited' : undefined}>
      <th scope="row">
        {factor.label} <Edited shown={changed} />
        {factor.description ? (
          <span className="micro muted block">{factor.description}</span>
        ) : null}
        {!factor.measured ? (
          <span className="micro muted block">
            This version cannot measure it, so it cannot be changed.
          </span>
        ) : null}
      </th>
      <td data-label="Weight">
        <input
          className="figures policy-number"
          type="number"
          inputMode="numeric"
          min={limits.min}
          max={limits.max}
          value={draft.weight}
          disabled={!factor.measured}
          aria-label={`${factor.label} weight`}
          onChange={(event) => onChange({ ...draft, weight: event.target.value })}
        />
      </td>
      <td data-label="Counts">
        <input
          type="checkbox"
          aria-label={`${factor.label} counts`}
          checked={draft.enabled}
          disabled={!factor.measured}
          onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
        />
      </td>
    </tr>
  );
}

function Bands({
  policy,
  draft,
  refused,
  onChange,
}: {
  policy: PolicyData;
  draft: Drafts['bands'];
  refused: ReactNode;
  onChange: (bands: Drafts['bands']) => void;
}) {
  const changed =
    draft.elevated !== String(policy.bands.elevatedFrom) ||
    draft.critical !== String(policy.bands.criticalFrom);
  const { min, max } = policy.limits.threshold;

  return (
    <section className="card stack" aria-labelledby="bands-heading">
      <h2 id="bands-heading">
        Where each band starts <Edited shown={changed} />
      </h2>
      <p className="micro muted measure">
        A score below High is Standard. Each band has its own chain above.{' '}
        {policy.bands.fromConfiguration
          ? 'These are still the values the server was started with.'
          : `Set by ${policy.bands.setBy?.name ?? 'someone who has since left'}, ${policy.bands.setAt ? formatClock(policy.bands.setAt) : ''}.`}
      </p>
      {refused}
      <div className="form-grid">
        <label htmlFor="band-elevated">High from</label>
        <input
          id="band-elevated"
          className="figures policy-number"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft.elevated}
          onChange={(event) => onChange({ ...draft, elevated: event.target.value })}
        />
        <label htmlFor="band-critical">Critical from</label>
        <input
          id="band-critical"
          className="figures policy-number"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft.critical}
          onChange={(event) => onChange({ ...draft, critical: event.target.value })}
        />
      </div>
    </section>
  );
}
