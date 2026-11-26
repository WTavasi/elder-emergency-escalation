import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../../shared/components/Icon';
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
import { durationWord, PRESETS, RECOMMENDED_WEIGHTS, TIME_CHOICES, type Preset } from './presets';

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
    if (key === 'timeoutSeconds') return durationWord(Number(value));
    if (key === 'dispatchMode') return value === 'PARALLEL' ? 'with the group before' : 'after it';
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

/** The drafts a preset gives: every chain and the bands, the weights as they are now. */
function applyPreset(policy: PolicyData, drafts: Drafts, preset: Preset): Drafts {
  const rules = { ...drafts.rules };
  for (const rule of policy.escalationRules) {
    const step = preset.rules[rule.severity]?.[rule.tier - 1];
    if (!step) continue;
    rules[ruleId(rule)] = {
      timeout: rule.last ? '' : String(step.timeoutSeconds ?? rule.timeoutSeconds ?? ''),
      parallel: rule.tier > 1 && step.dispatchMode === 'PARALLEL',
      textAtOnce: step.smsFallbackImmediate,
    };
  }
  return {
    ...drafts,
    rules,
    bands: {
      elevated: String(preset.bands.elevatedFrom),
      critical: String(preset.bands.criticalFrom),
    },
  };
}

/** Whether a policy, or the drafts on screen, are exactly what a preset sets. */
function matchesPreset(policy: PolicyData, drafts: Drafts, preset: Preset): boolean {
  const applied = applyPreset(policy, drafts, preset);
  return (
    JSON.stringify(applied.rules) === JSON.stringify(drafts.rules) &&
    JSON.stringify(applied.bands) === JSON.stringify(drafts.bands)
  );
}

/**
 * When each tier of a chain is asked, in seconds after the alert, from the drafts: a tier
 * asked "after the group before" waits for that group's time limit; one asked "with the
 * group before" goes at the same moment.
 */
function askedAt(rules: PolicyRule[], drafts: Drafts): number[] {
  const times: number[] = [];
  rules.forEach((rule, index) => {
    if (index === 0) {
      times.push(0);
      return;
    }
    const before = rules[index - 1]!;
    const draft = drafts.rules[ruleId(rule)];
    const wait = Number(drafts.rules[ruleId(before)]?.timeout || 0);
    times.push(draft?.parallel ? times[index - 1]! : times[index - 1]! + wait);
  });
  return times;
}

/**
 * The escalation policy, for administrators, in the order a person thinks about it:
 *
 * 1. **Start from a preset.** A short list of tested settings, each in a sentence. Choosing
 *    one fills in every chain and where High and Critical start; nothing is saved until
 *    Save changes. The preset the policy matches now is marked "In use".
 * 2. **Who is asked, and when.** One severity at a time, chosen above the chain. Each group
 *    is a step with how long it is given, picked from a list of times rather than typed in
 *    seconds, whether it waits for the group before, and whether it is texted at once.
 *    A line under the chain says when emergency services are reached at the latest.
 * 3. **How severity is judged.** The factors' weights, with a reset to the recommended
 *    ones, and the scores where High and Critical start.
 * 4. **Changes.** Who changed what, and when.
 *
 * Edits are gathered and saved together from a bar at the foot of the window, each edited
 * row marked "Edited". The server checks every change, records who made it and uses it
 * from the next alert; a refused change is explained in its own section.
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
  const [severity, setSeverity] = useState<Severity>('STANDARD');
  const [presetName, setPresetName] = useState<string | null>(null);

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
    const bandsEdit: Edit | null =
      drafts.bands.elevated !== String(policy.bands.elevatedFrom) ||
      drafts.bands.critical !== String(policy.bands.criticalFrom)
        ? {
            area: 'bands',
            label: 'The bands',
            send: () =>
              api.escalationPolicy.updateBands({
                elevatedFrom: Number(drafts.bands.elevated),
                criticalFrom: Number(drafts.bands.critical),
              }),
          }
        : null;
    // Lowering where Critical starts goes before the weights, and raising it after them,
    // so the server never sees a moment where no alert could reach Critical.
    const bandsFirst = bandsEdit && Number(drafts.bands.critical) < policy.bands.criticalFrom;
    if (bandsEdit && bandsFirst) edits.push(bandsEdit);
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
    if (bandsEdit && !bandsFirst) edits.push(bandsEdit);
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
        presetName
          ? `${presetName} saved. It applies from the next alert.`
          : `${done === 1 ? `${edits[0]!.label} saved.` : `${done} changes saved.`} They apply from the next alert.`,
      );
      setPresetName(null);
    }
    setBusy(false);
  }

  function discard() {
    if (policy) setDrafts(draftsFrom(policy));
    setRefusal(null);
    setPresetName(null);
  }

  const refused = (area: Area) =>
    refusal?.area === area ? <ErrorNotice message={refusal.text} /> : null;
  const labels = Object.fromEntries(
    (policy?.severityFactors ?? []).map((factor) => [factor.key, factor.label]),
  );

  const chain = (policy?.escalationRules ?? [])
    .filter((rule) => rule.severity === severity)
    .sort((left, right) => left.tier - right.tier);
  const times = policy && drafts ? askedAt(chain, drafts) : [];
  const lastRule = chain.at(-1);
  const edited = (band: Severity) =>
    Boolean(
      policy &&
      drafts &&
      policy.escalationRules.some(
        (rule) => rule.severity === band && ruleChanged(rule, drafts.rules[ruleId(rule)]),
      ),
    );
  const savedDrafts = policy ? draftsFrom(policy) : null;

  return (
    <>
      <PageHeader title="Escalation policy" />

      {loading && !policy ? (
        <Skeleton rows={6} />
      ) : error && !policy ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : policy && drafts && savedDrafts ? (
        <div className="stack">
          <section className="card stack" aria-labelledby="presets-heading">
            <h2 id="presets-heading">Start from a preset</h2>
            <ul className="presets">
              {PRESETS.map((preset) => {
                const inUse = matchesPreset(policy, savedDrafts, preset);
                const chosen = !inUse && matchesPreset(policy, drafts, preset) && waiting > 0;
                return (
                  <li key={preset.id}>
                    <button
                      type="button"
                      className={`preset${inUse ? ' preset--in-use' : ''}${chosen ? ' preset--chosen' : ''}`}
                      aria-pressed={matchesPreset(policy, drafts, preset)}
                      onClick={() => {
                        setDrafts(applyPreset(policy, drafts, preset));
                        setPresetName(inUse ? null : `The ${preset.name} preset`);
                        setRefusal(null);
                      }}
                    >
                      <span className="preset__name">
                        {preset.name}
                        {inUse ? <span className="preset__tag">In use</span> : null}
                        {chosen ? <span className="preset__tag">Chosen, not saved</span> : null}
                      </span>
                      <span className="preset__summary">{preset.summary}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card stack" aria-labelledby="rules-heading">
            <div className="section-head">
              <h2 id="rules-heading">Who is asked, and when</h2>
              <div className="segmented" role="group" aria-label="Severity">
                {SEVERITIES.map((band) => (
                  <button
                    key={band}
                    type="button"
                    aria-pressed={severity === band}
                    onClick={() => setSeverity(band)}
                  >
                    {severityWord(band)}
                    {edited(band) ? <span className="edited-dot" aria-label=", edited" /> : null}
                  </button>
                ))}
              </div>
            </div>
            {refused('rules')}
            <ol className="chain" aria-label={`${severityWord(severity)} alerts`}>
              {chain.map((rule, index) => (
                <ChainStep
                  key={ruleId(rule)}
                  rule={rule}
                  draft={drafts.rules[ruleId(rule)]!}
                  askedAt={times[index] ?? 0}
                  limits={policy.limits.timeoutSeconds}
                  onChange={(draft) =>
                    setDrafts({
                      ...drafts,
                      rules: { ...drafts.rules, [ruleId(rule)]: draft },
                    })
                  }
                />
              ))}
            </ol>
            {lastRule ? (
              <p className="chain__summary">
                <Icon name="timer" size={18} />
                {times.at(-1)
                  ? `If nobody answers, ${(WHO[lastRule.responderRole] ?? 'the last group').toLowerCase()} are asked ${durationWord(times.at(-1)!)} after a ${severityWord(severity).toLowerCase()} alert.`
                  : `${WHO[lastRule.responderRole] ?? 'The last group'} are asked as soon as a ${severityWord(severity).toLowerCase()} alert is raised.`}
              </p>
            ) : null}
          </section>

          <section className="card stack" aria-labelledby="weights-heading">
            <div className="section-head">
              <h2 id="weights-heading">How severity is judged</h2>
              <button
                type="button"
                className="button--quiet"
                onClick={() =>
                  setDrafts({
                    ...drafts,
                    factors: Object.fromEntries(
                      policy.severityFactors.map((factor) => [
                        factor.key,
                        factor.measured && RECOMMENDED_WEIGHTS[factor.key] !== undefined
                          ? { weight: String(RECOMMENDED_WEIGHTS[factor.key]), enabled: true }
                          : drafts.factors[factor.key]!,
                      ]),
                    ),
                  })
                }
              >
                Reset weights to recommended
              </button>
            </div>
            {refused('weights')}
            <table className="list policy-table">
              <caption className="visually-hidden">Severity factors</caption>
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
            <p className="micro muted">
              The highest score an alert can reach now is{' '}
              <span className="figures">{policy.maxScore}</span>.
            </p>
            <Bands
              policy={policy}
              draft={drafts.bands}
              refused={refused('bands')}
              onChange={(bands) => setDrafts({ ...drafts, bands })}
            />
          </section>

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
            {presetName ?? (waiting === 1 ? '1 unsaved change' : `${waiting} unsaved changes`)}
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

/**
 * One group in a chain, as a numbered step: who they are and when they are asked, how long
 * they are given before the next group, whether they wait for the group before, and
 * whether they are texted at once.
 */
function ChainStep({
  rule,
  draft,
  askedAt: at,
  limits,
  onChange,
}: {
  rule: PolicyRule;
  draft: RuleDraft;
  askedAt: number;
  limits: { min: number; max: number };
  onChange: (draft: RuleDraft) => void;
}) {
  const id = ruleId(rule);
  const who = WHO[rule.responderRole] ?? rule.responderRole;
  const changed = ruleChanged(rule, draft);
  const name = `${severityWord(rule.severity)} tier ${rule.tier}`;
  // The times offered, within the server's limits, with the one set now kept in the list.
  const times = [...TIME_CHOICES, Number(draft.timeout || 0)]
    .filter((seconds, index, all) => seconds > 0 && all.indexOf(seconds) === index)
    .filter((seconds) => seconds >= limits.min && seconds <= limits.max)
    .sort((left, right) => left - right);

  return (
    <li className={`chain__step${changed ? ' chain__step--edited' : ''}`}>
      <span className="chain__number" aria-hidden="true">
        {rule.tier}
      </span>
      <div className="chain__who">
        <strong>{who}</strong> <Edited shown={changed} />
        <span className="micro muted block">
          {at === 0 ? 'Asked as soon as the alert is raised' : `Asked after ${durationWord(at)}`}
        </span>
      </div>
      <div className="chain__fields">
        {rule.last ? (
          <span className="chain__field chain__field--none">
            <span className="micro muted">Given</span>
            <span className="muted">End of the chain</span>
          </span>
        ) : (
          <label htmlFor={`timeout-${id}`} className="chain__field">
            <span className="micro muted">Given</span>
            <select
              id={`timeout-${id}`}
              value={draft.timeout}
              aria-label={`${name} time limit`}
              onChange={(event) => onChange({ ...draft, timeout: event.target.value })}
            >
              {times.map((seconds) => (
                <option key={seconds} value={String(seconds)}>
                  {durationWord(seconds)}
                </option>
              ))}
            </select>
          </label>
        )}
        {rule.tier === 1 ? (
          <span className="chain__field chain__field--none">
            <span className="micro muted">Asked</span>
            <span className="muted">First</span>
          </span>
        ) : (
          <label className="chain__field">
            <span className="micro muted">Asked</span>
            <select
              aria-label={`How ${name} is asked`}
              value={draft.parallel ? 'PARALLEL' : 'SEQUENTIAL'}
              onChange={(event) =>
                onChange({ ...draft, parallel: event.target.value === 'PARALLEL' })
              }
            >
              <option value="SEQUENTIAL">After the group before</option>
              <option value="PARALLEL">Together with the group before</option>
            </select>
          </label>
        )}
        <label className="chain__check">
          <input
            type="checkbox"
            aria-label={`Text ${name} at once`}
            checked={draft.textAtOnce}
            onChange={(event) => onChange({ ...draft, textAtOnce: event.target.checked })}
          />
          Text at once
        </label>
      </div>
    </li>
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
    <div className="stack" role="group" aria-labelledby="bands-heading">
      <h3 id="bands-heading">
        Where each band starts <Edited shown={changed} />
      </h3>
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
      <p className="micro muted">
        Below High is Standard.{' '}
        {policy.bands.fromConfiguration
          ? 'These are still the values the server was started with.'
          : `Set by ${policy.bands.setBy?.name ?? 'someone who has since left'}, ${policy.bands.setAt ? formatClock(policy.bands.setAt) : ''}.`}
      </p>
    </div>
  );
}
