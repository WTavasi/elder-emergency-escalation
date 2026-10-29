import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { useAuth } from '../../shared/state/AuthContext';
import { useRealtime } from '../../shared/api/realtime';
import { useLoader } from '../../shared/hooks/useLoader';
import type { AlertDetail, AuditEntry, ChainMember, Journey } from '../../shared/api/types';
import { OPEN_STATES } from '../../shared/api/types';
import { Icon } from '../../shared/components/Icon';
import { Modal } from '../../shared/components/Modal';
import { PageHeader } from '../../shared/components/PageHeader';
import {
  Countdown,
  ErrorNotice,
  SeverityLabel,
  Skeleton,
  StatePill,
  TriggerTag,
} from '../../shared/components/parts';
import {
  distance,
  formatClock,
  formatDuration,
  humanise,
  timeAway,
} from '../../shared/utils/format';
import { afterTheAlert, timelineSentence } from '../../shared/utils/timeline';

/**
 * Where one person on the chain stands. Worked out from the tier the emergency has
 * reached and who took it on, because that is everything the record says about them;
 * whether a message actually reached them is in the delivery table below.
 */
function stepFor(
  member: ChainMember,
  alert: AlertDetail,
): { status: 'done' | 'current' | 'asked' | 'later'; text: string } {
  const open = OPEN_STATES.includes(alert.state);
  if (alert.acknowledgedBy?.id === member.responderId) {
    return { status: 'done', text: 'Took it on' };
  }
  if (member.priorityOrder < alert.currentTier) return { status: 'asked', text: 'Asked earlier' };
  if (member.priorityOrder === alert.currentTier) {
    return open && !alert.acknowledgedBy
      ? { status: 'current', text: 'Being asked now' }
      : { status: 'asked', text: 'Asked' };
  }
  return open && !alert.acknowledgedBy
    ? { status: 'later', text: 'Next if nobody answers' }
    : { status: 'later', text: 'Not needed' };
}

/**
 * One banner in place of four equal cards. The four were the same size, so nothing on
 * the page said which mattered; the banner leads with what an operator acts on (state,
 * severity, who owns it, time left) and the rest becomes a line of detail beneath it.
 */
function StatusBanner({ alert, onExplain }: { alert: AlertDetail; onExplain: () => void }) {
  const open = OPEN_STATES.includes(alert.state);
  const waiting = open && !alert.acknowledgedBy;
  const tone = waiting ? 'waiting' : open ? 'owned' : 'closed';

  return (
    <section className={`banner banner--${tone}`} aria-label="Status">
      <div className="banner__main">
        <div className="row">
          <StatePill state={alert.state} />
          <SeverityLabel severity={alert.severity} score={alert.severityScore} />
          <span className="muted">Tier {alert.currentTier}</span>
          {/*
            The breakdown opens in a panel at the side of the page rather than unfolding
            inside it, so reading it never pushes the timeline or the chain out of place.
          */}
          {alert.severityFactors?.factors.length ? (
            <button type="button" className="link-button micro" onClick={onExplain}>
              Why this severity?
            </button>
          ) : null}
        </div>
        <p className="banner__owner">
          <Icon name="person" />
          {alert.acknowledgedBy
            ? `${alert.acknowledgedBy.name}, ${humanise(alert.acknowledgedBy.role)}, has taken it on`
            : open
              ? 'Nobody has taken it on yet'
              : 'Nobody took it on'}
        </p>
      </div>
      {open && alert.deadlineAt ? (
        <div className="banner__timer">
          <Icon name="timer" />
          <span>
            <span className="banner__countdown">
              <Countdown deadlineAt={alert.deadlineAt} />
            </span>
            <span className="micro">left on this tier</span>
          </span>
        </div>
      ) : null}
    </section>
  );
}

export function EventDetail() {
  const { id = '' } = useParams();
  const { session } = useAuth();

  const fetcher = useCallback(() => api.alert(id), [id]);
  const {
    data: alert,
    error,
    loading,
    reload,
  } = useLoader(
    fetcher,
    'Could not load this emergency. It may have been removed, or you may not have access to it.',
  );

  // Any change to this emergency reloads the record rather than patching it: the
  // timeline and the delivery log both change with it and neither is in the snapshot.
  // A detail screen is one request, and correctness is worth more than the saving.
  const onUpdate = useCallback(
    (snapshot: { eventId: string }) => {
      if (snapshot.eventId === id) reload();
    },
    [id, reload],
  );
  useRealtime(session?.accessToken ?? null, onUpdate);

  const [explaining, setExplaining] = useState(false);

  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (loading || !alert) return <Skeleton rows={5} />;

  const factors = alert.severityFactors?.factors ?? [];
  const timeline = firstThingsFirst(alert.timeline);

  return (
    <>
      <PageHeader
        title={alert.elder.name}
        // Back to where an emergency like this one is listed: the board while it is open,
        // the history once it is over.
        back={
          OPEN_STATES.includes(alert.state)
            ? { to: '/', label: 'Open emergencies' }
            : { to: '/history', label: 'History' }
        }
        titleAddon={
          <>
            <TriggerTag trigger={alert.trigger} />
            {/*
              The short layer of the privacy notice, where the missing buttons would be:
              an administrator reads, the care chain acts.
            */}
            <span className="tag" tabIndex={0} aria-describedby="view-only-tip">
              View only
              <span role="tooltip" id="view-only-tip" className="tip">
                Taking on, declining and closing an emergency belong to the people in this
                elder&apos;s care chain. The server refuses them from an administrator account.
              </span>
            </span>
          </>
        }
      >
        <p>
          Raised {formatClock(alert.triggeredAt)}
          {alert.trigger === 'MISSED_CHECK_IN'
            ? `, when ${alert.elder.name.split(' ')[0]} did not answer a daily check-in`
            : ''}
          {alert.addressLabel ? ` at ${alert.addressLabel}` : ''}
          {alert.withheld?.includes('location')
            ? '. Location withheld at the elder\u2019s request'
            : ''}
        </p>
      </PageHeader>

      <StatusBanner alert={alert} onExplain={() => setExplaining(true)} />
      <p className="micro muted" style={{ marginTop: 'calc(var(--space-12) * -1)' }}>
        {alert.responseSeconds === null
          ? 'Not answered yet'
          : `Answered in ${formatDuration(alert.responseSeconds)}`}
        {alert.resolvedAt ? `, closed ${formatClock(alert.resolvedAt)}` : ''}
      </p>

      <OnTheWay alert={alert} />
      <Volunteers alert={alert} />

      <div className="detail-grid">
        <section className="card stack" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading">What happened</h2>
          {/*
            Numbered on a line from the first thing that happened to the latest, in the
            app's sentences, with the latest filled in: the same drawing as the chain beside
            it, and as the app's own page for an emergency.
          */}
          <ol className="steps steps--timeline">
            {timeline.map((entry, index) => {
              const latest = index === timeline.length - 1;
              return (
                <li key={entry.id} className={`step${latest ? ' step--latest' : ''}`}>
                  <span className="step__marker" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>
                    <span className="step__name">
                      {timelineSentence(entry, {
                        chain: alert.chain,
                        deliveries: alert.deliveries,
                      })}
                    </span>
                    <span className="step__status">
                      {afterTheAlert(entry.secondsFromTrigger)},{' '}
                      <span className="figures">{formatClock(entry.occurredAt)}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="stack">
          <section className="card stack" aria-labelledby="chain-heading">
            <h2 id="chain-heading">Escalation chain</h2>
            <p className="muted micro">The order this elder&apos;s contacts are tried in.</p>
            <ol className="steps">
              {alert.chain.map((member) => {
                const step = stepFor(member, alert);
                return (
                  <li
                    key={member.responderId}
                    className={`step step--${step.status}`}
                    aria-current={step.status === 'current' ? 'step' : undefined}
                  >
                    <span className="step__marker" aria-hidden="true">
                      {step.status === 'done' ? (
                        <Icon name="check" size={16} />
                      ) : (
                        member.priorityOrder
                      )}
                    </span>
                    <span>
                      <span className="step__name">{member.name}</span>
                      <span className="micro muted"> {humanise(member.role)}</span>
                      <span className="step__status">
                        <span className="visually-hidden">Tier {member.priorityOrder}, </span>
                        {step.text}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>

      {/*
        Folded away, as detail somebody opens when they want it: the sentences above already
        say who was sent what, and this is the record of every message underneath them.
      */}
      {alert.deliveries.length === 0 ? (
        <p className="muted">Nothing has been dispatched for this emergency.</p>
      ) : (
        <details className="card disclosure">
          <summary className="disclosure__summary">
            <h2 id="delivery-heading">
              Show {alert.deliveries.length}{' '}
              {alert.deliveries.length === 1 ? 'delivery attempt' : 'delivery attempts'}
            </h2>
          </summary>
          <div className="disclosure__body">
            <p className="muted micro">
              A failed push followed by a text to the same person is the fallback working, not two
              separate faults.
            </p>
            <table>
              <thead>
                <tr>
                  <th scope="col">Recipient</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Sent</th>
                </tr>
              </thead>
              <tbody>
                {alert.deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{delivery.recipient?.name ?? 'unknown'}</td>
                    <td className="figures">{delivery.tier}</td>
                    <td>{delivery.channel.toLowerCase()}</td>
                    <td>{humanise(delivery.status)}</td>
                    <td className="micro">{delivery.failureReason ?? ''}</td>
                    <td className="figures">
                      {delivery.sentAt ? formatClock(delivery.sentAt) : 'not sent'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {explaining ? (
        <Modal
          side
          title="Why this severity"
          onClose={() => setExplaining(false)}
          footer={
            <button type="button" onClick={() => setExplaining(false)}>
              Close
            </button>
          }
        >
          <p className="muted micro" style={{ marginTop: 0 }}>
            The score is the sum of each factor&apos;s weight times its value. The weights are the
            severity policy, set in the database, so a decision can be explained afterwards rather
            than taken on trust.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col" className="num">
                  Weight
                </th>
                <th scope="col" className="num">
                  Value
                </th>
                <th scope="col" className="num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {factors.map((factor) => (
                <tr key={factor.key}>
                  <td>
                    {humanise(factor.key)}
                    {factor.detail ? <div className="micro">{factor.detail}</div> : null}
                  </td>
                  <td className="figures num">{factor.weight}</td>
                  <td className="figures num">{factor.value}</td>
                  <td className="figures num">{factor.contribution}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Score</strong>
                </td>
                <td />
                <td />
                <td className="figures num">
                  <strong>{alert.severityScore}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </Modal>
      ) : null}
    </>
  );
}

/**
 * The person who took it on: how long until they are with the elder, where they are
 * now, or when they arrived, and whether anybody has started talking to the elder in
 * the app. Shown only while there is something to show. The position comes from the API
 * for the care circle and the console alike, is a few seconds old at most, and is never
 * stored; the link opens it in a map rather than putting a map on this page.
 */
function OnTheWay({ alert }: { alert: AlertDetail }) {
  const open = OPEN_STATES.includes(alert.state);
  const owner = alert.acknowledgedBy?.name.split(' ')[0];
  const journey = alert.journey ?? null;
  const caller = alert.voice?.startedBy ?? null;

  const travelling = open && owner && !alert.arrivedAt && journey;
  const arrived = owner && alert.arrivedAt;
  if (!travelling && !arrived && !(open && caller)) return null;

  return (
    <section className="card stack" aria-labelledby="on-the-way-heading" aria-live="polite">
      <h2 id="on-the-way-heading">{arrived ? 'With the elder' : 'On the way'}</h2>
      {travelling && journey ? <Travelling owner={owner} journey={journey} /> : null}
      {arrived && alert.arrivedAt ? (
        <p>
          {owner} arrived {formatClock(alert.arrivedAt)}
          {alert.acknowledgedAt
            ? `, ${formatDuration(
                (Date.parse(alert.arrivedAt) - Date.parse(alert.acknowledgedAt)) / 1000,
              )} after taking it on.`
            : '.'}
        </p>
      ) : null}
      {open && caller ? (
        <p className="micro muted">
          {caller} started a call in the app with {alert.elder.name.split(' ')[0]}.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Community volunteers near the alert, when any were asked: how many, and the one going.
 * They go beside the chain, so this never reads as somebody having taken it on.
 */
function Volunteers({ alert }: { alert: AlertDetail }) {
  const volunteer = alert.volunteer ?? null;
  if (!volunteer) return null;

  return (
    <section className="card stack" aria-labelledby="volunteers-heading" aria-live="polite">
      <h2 id="volunteers-heading">Community volunteers</h2>
      <p>
        {volunteer.asked === 0
          ? `Nobody available nearby when asked at ${formatClock(volunteer.askedAt)}.`
          : `${volunteer.asked} nearby asked at ${formatClock(volunteer.askedAt)}.`}
      </p>
      {volunteer.name && volunteer.acceptedAt ? (
        <p>
          <strong>{volunteer.name}</strong> said they would go at{' '}
          {formatClock(volunteer.acceptedAt)}
          {volunteer.distanceMetres !== null ? `, ${distance(volunteer.distanceMetres)} away` : ''}
          {volunteer.arrivedAt ? ` and arrived ${formatClock(volunteer.arrivedAt)}.` : '.'}
          {volunteer.phone ? <span className="micro muted figures"> {volunteer.phone}</span> : null}
        </p>
      ) : volunteer.asked > 0 && OPEN_STATES.includes(alert.state) ? (
        <p className="micro muted">None has said they will go yet.</p>
      ) : null}
    </section>
  );
}

function Travelling({ owner, journey }: { owner: string; journey: Journey }) {
  const how = journey.source === 'osrm' ? 'by road' : 'in a straight line';
  const where =
    journey.latitude !== null && journey.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${journey.latitude},${journey.longitude}`
      : null;

  return (
    <>
      <p>
        <strong>
          {owner} is {timeAway(journey.etaSeconds)} away
        </strong>
      </p>
      <p className="micro muted">
        {distance(journey.distanceMetres)} {how}, updated {formatClock(journey.updatedAt)}.
      </p>
      {where ? (
        <p>
          <a href={where} target="_blank" rel="noopener noreferrer">
            Where {owner} is now
          </a>
        </p>
      ) : null}
    </>
  );
}

/**
 * The record in order, with the alert itself always first. Scoring is written in the same
 * instant as the alert, and an equal timestamp would otherwise let "Scored standard, 30"
 * come before "Grace asked for help".
 */
function firstThingsFirst(entries: AuditEntry[]): AuditEntry[] {
  const created = entries.find((entry) => entry.action === 'EVENT_CREATED');
  return created ? [created, ...entries.filter((entry) => entry !== created)] : entries;
}
