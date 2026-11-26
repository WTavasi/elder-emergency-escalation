import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { useAuth } from '../../shared/state/AuthContext';
import { useRealtime } from '../../shared/api/realtime';
import { useLoader } from '../../shared/hooks/useLoader';
import type {
  AlertDetail,
  AuditEntry,
  ChainMember,
  Journey,
  MedicalLooks as Looks,
  Role,
} from '../../shared/api/types';
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
  SERVICE_LABEL,
  severityWord,
  timeAway,
  TYPE_LABEL,
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
        {/*
          Both lines are there from the start, so a type reported a few seconds in, or an
          answer, changes what they say and never how tall the banner is.
        */}
        {/* When and where, said once here rather than as a line under the page's title. */}
        <p className="banner__raised">
          Raised {formatClock(alert.triggeredAt)}
          {alert.trigger === 'MISSED_CHECK_IN'
            ? `, when ${alert.elder.name.split(' ')[0]} did not answer a daily check-in`
            : ''}
          {alert.addressLabel ? ` at ${alert.addressLabel}` : ''}
          {alert.withheld?.includes('location')
            ? '. Location withheld at the elder\u2019s request'
            : ''}
        </p>
        <p className="banner__report">
          {alert.reportedType ? (
            <>
              Reported: <strong>{TYPE_LABEL[alert.reportedType]}</strong>
            </>
          ) : (
            <span className="muted">No type reported{open ? ' yet' : ''}</span>
          )}
          {alert.serviceRequested ? <>. Asked: {SERVICE_LABEL[alert.serviceRequested]}</> : null}
          {alert.confirmedType && alert.confirmedType !== alert.reportedType ? (
            <>. Confirmed on closing: {TYPE_LABEL[alert.confirmedType]}</>
          ) : null}
        </p>
        <p className="banner__owner">
          <Icon name="person" />
          <span>
            {alert.acknowledgedBy
              ? `${alert.acknowledgedBy.name}, ${humanise(alert.acknowledgedBy.role)}, has taken it on`
              : open
                ? 'Nobody has taken it on yet'
                : 'Nobody took it on'}
            {alert.responseSeconds !== null || alert.resolvedAt ? (
              <span className="banner__after">
                {alert.responseSeconds !== null
                  ? ` · Answered in ${formatDuration(alert.responseSeconds)}`
                  : ''}
                {alert.resolvedAt ? ` · Closed ${formatClock(alert.resolvedAt)}` : ''}
              </span>
            ) : null}
          </span>
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
  const [deliveries, setDeliveries] = useState(false);
  const side = useRef<HTMLDivElement>(null);
  const sideFits = useFits(side, alert);

  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (loading || !alert) return <Skeleton rows={5} />;

  const open = OPEN_STATES.includes(alert.state);
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
      />

      <StatusBanner alert={alert} onExplain={() => setExplaining(true)} />

      {/*
        Two columns that never push each other: the record on the left grows at its foot,
        and everything that arrives while the emergency is open has a place of its own on
        the right, held from the start, so a card appearing never moves what is being read.
      */}
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
          {/*
            The record of every message opens in the panel at the side, as the severity
            breakdown does, rather than unfolding here and pushing the page down.
          */}
          {alert.deliveries.length === 0 ? (
            <p className="muted micro">Nothing has been dispatched for this emergency.</p>
          ) : (
            <p>
              <button
                type="button"
                className="link-button"
                aria-haspopup="dialog"
                onClick={() => setDeliveries(true)}
              >
                Show {alert.deliveries.length}{' '}
                {alert.deliveries.length === 1 ? 'delivery attempt' : 'delivery attempts'}
              </button>
            </p>
          )}
        </section>

        <div ref={side} className={`stack detail-side${sideFits ? ' detail-side--sticky' : ''}`}>
          <section className="card stack" aria-labelledby="chain-heading">
            <h2 id="chain-heading">Escalation chain</h2>
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
          <GettingHelp alert={alert} />
          <Said alert={alert} />
          {/* Last, as it is asked for separately and may arrive after the rest. */}
          <MedicalLooks id={id} version={alert.timeline.length} open={open} />
        </div>
      </div>

      {deliveries ? (
        <Modal
          side
          wide
          title="Delivery attempts"
          onClose={() => setDeliveries(false)}
          footer={
            <button type="button" onClick={() => setDeliveries(false)}>
              Close
            </button>
          }
        >
          <p className="muted micro" style={{ marginTop: 0 }}>
            A failed push followed by a text to the same person is the fallback working, not two
            separate faults.
          </p>
          <table className="list">
            <thead>
              <tr>
                <th scope="col">Recipient</th>
                <th scope="col" className="num">
                  Tier
                </th>
                <th scope="col">Channel</th>
                <th scope="col">Status</th>
                <th scope="col">Sent</th>
              </tr>
            </thead>
            <tbody>
              {alert.deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    <strong>{delivery.recipient?.name ?? 'unknown'}</strong>
                  </td>
                  <td className="figures num" data-label="Tier">
                    {delivery.tier}
                  </td>
                  <td data-label="Channel">{delivery.channel.toLowerCase()}</td>
                  <td data-label="Status">
                    {humanise(delivery.status)}
                    {delivery.failureReason ? (
                      <div className="micro muted">{delivery.failureReason}</div>
                    ) : null}
                  </td>
                  <td className="figures" data-label="Sent">
                    {delivery.sentAt ? formatClock(delivery.sentAt) : 'not sent'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      ) : null}

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
              {alert.severityFactors?.floor ? (
                <tr>
                  <td colSpan={4}>
                    {TYPE_LABEL[alert.severityFactors.floor.type]} was reported, so at least{' '}
                    {severityWord(alert.severityFactors.floor.band).toLowerCase()}, whatever the
                    score.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Modal>
      ) : null}
    </>
  );
}

/**
 * Everybody coming to help, in three rows that are there from the moment the emergency
 * opens: the care circle on the way, community volunteers, and the emergency services.
 * Each row says "nobody yet" until it has something, so news arriving changes a line and
 * never moves the cards beneath it. Once the emergency is closed nothing changes, so the
 * empty rows are left out. Positions come from the API, are a few seconds old at most and
 * are never stored; the link opens one in a map rather than putting a map on this page.
 */
function GettingHelp({ alert }: { alert: AlertDetail }) {
  const open = OPEN_STATES.includes(alert.state);
  const circle = <CircleOnTheWay alert={alert} />;
  const volunteers = <VolunteerRow alert={alert} />;
  const stations = <StationsRow alert={alert} />;
  const hasCircle = circleHasNews(alert);
  const hasVolunteer = Boolean(alert.volunteer);
  const hasStations = (alert.stations ?? []).length > 0;
  if (!open && !hasCircle && !hasVolunteer && !hasStations) return null;

  return (
    <section className="card stack" aria-labelledby="help-heading" aria-live="polite">
      <h2 id="help-heading">Getting help</h2>
      {open || hasCircle ? (
        <div className="help-row">
          <h3>Care circle</h3>
          {hasCircle ? circle : <p className="muted">Nobody is on the way yet.</p>}
        </div>
      ) : null}
      {open || hasVolunteer ? (
        <div className="help-row">
          <h3>Community volunteers</h3>
          {hasVolunteer ? volunteers : <p className="muted">None asked yet.</p>}
        </div>
      ) : null}
      {open || hasStations ? (
        <div className="help-row">
          <h3>Emergency services</h3>
          {hasStations ? stations : <p className="muted">None asked yet.</p>}
        </div>
      ) : null}
    </section>
  );
}

/** Who in the care circle is travelling, and who has arrived or started a call. */
function travellersOf(alert: AlertDetail) {
  const open = OPEN_STATES.includes(alert.state);
  const owner = alert.acknowledgedBy?.name.split(' ')[0];
  // An API from before several people could share sends the owner's alone.
  const journeys = alert.journeys ?? (alert.journey ? [alert.journey] : []);
  const travellers = open
    ? journeys.flatMap((journey) => {
        const name =
          journey.traveller === 'volunteer'
            ? alert.volunteer?.name?.split(' ')[0]
            : alert.arrivedAt
              ? undefined
              : owner;
        return name ? [{ name, journey }] : [];
      })
    : [];
  return { open, owner, travellers, caller: alert.voice?.startedBy ?? null };
}

function circleHasNews(alert: AlertDetail): boolean {
  const { open, owner, travellers, caller } = travellersOf(alert);
  return travellers.length > 0 || Boolean(owner && alert.arrivedAt) || Boolean(open && caller);
}

function CircleOnTheWay({ alert }: { alert: AlertDetail }) {
  const { open, owner, travellers, caller } = travellersOf(alert);
  const arrived = owner && alert.arrivedAt;

  return (
    <>
      {travellers.map(({ name, journey }) => (
        <Travelling key={journey.userId ?? name} owner={name} journey={journey} />
      ))}
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
    </>
  );
}

/**
 * Community volunteers near the alert, when any were asked: how many, and the one going.
 * They sit apart from the chain, so this never reads as somebody having taken it on.
 */
function VolunteerRow({ alert }: { alert: AlertDetail }) {
  const volunteer = alert.volunteer ?? null;
  if (!volunteer) return null;

  return (
    <>
      <p>
        {volunteer.asked === 0
          ? `Nobody available nearby when asked at ${formatClock(volunteer.askedAt)}.`
          : `${volunteer.asked} nearby asked at ${formatClock(volunteer.askedAt)}.`}
      </p>
      {volunteer.name && volunteer.acceptedAt ? (
        <p>
          <strong>{volunteer.name}</strong> said they would go at{' '}
          {formatClock(volunteer.acceptedAt)}
          {volunteer.distanceMetres !== null
            ? `, ${distance(volunteer.distanceMetres)} away${volunteer.byRoad ? ' by road' : ''}`
            : ''}
          {volunteer.arrivedAt ? ` and arrived ${formatClock(volunteer.arrivedAt)}.` : '.'}
          {volunteer.phone ? <span className="micro muted figures"> {volunteer.phone}</span> : null}
        </p>
      ) : volunteer.asked > 0 && OPEN_STATES.includes(alert.state) ? (
        <p className="micro muted">None has said they will go yet.</p>
      ) : null}
    </>
  );
}

/**
 * The stations asked, nearest by road first, then any asked after a decline or no
 * answer. The time is from the station, so it is an estimate: the unit may be out.
 */
function StationsRow({ alert }: { alert: AlertDetail }) {
  return (
    <>
      {(alert.stations ?? []).map((station) => (
        <p key={`${station.name}-${station.askedAt}`}>
          <strong>{station.name}</strong>{' '}
          {station.status === 'declined'
            ? "can't come."
            : station.status === 'coming'
              ? 'is on the way.'
              : 'asked, no answer yet.'}
          <span className="micro muted" style={{ display: 'block' }}>
            Asked {formatClock(station.askedAt)}
            {station.etaSeconds !== null && station.status !== 'declined'
              ? `. ${capitalised(timeAway(station.etaSeconds))} away${station.byRoad ? ' by road' : ''}, from the station`
              : ''}
            {station.station ? `. ${station.station}` : ''}.
          </span>
        </p>
      ))}
    </>
  );
}

/** What the elder said after pressing help, in their words and in English. */
function Said({ alert }: { alert: AlertDetail }) {
  const said = (alert.speech ?? []).filter((item) => item.transcript.length > 0);
  const open = OPEN_STATES.includes(alert.state);
  // Held open while the emergency is, as words can arrive at any moment; left out of a
  // closed one where nothing was said.
  if (said.length === 0 && !open) return null;
  const first = alert.elder.name.split(' ')[0];

  return (
    <section className="card stack" aria-labelledby="said-heading" aria-live="polite">
      <h2 id="said-heading">What {first} said</h2>
      {said.length === 0 ? <p className="muted">Nothing recorded yet.</p> : null}
      {said.map((item) => (
        <p key={item.at}>
          &ldquo;{item.transcript}&rdquo;
          {item.english ? (
            <span className="muted" style={{ display: 'block' }}>
              In English: {item.english}
            </span>
          ) : null}
          <span className="micro muted" style={{ display: 'block' }}>
            {formatClock(item.at)}
            {item.heardType
              ? `. Heard: ${(TYPE_LABEL[item.heardType] ?? item.heardType).toLowerCase()}`
              : ''}
            {item.applied ? ', and reported' : ''}.
          </span>
        </p>
      ))}
    </section>
  );
}

const ROLE_WORD: Partial<Record<Role, string>> = {
  CAREGIVER: 'caregiver',
  FAMILY_MEMBER: 'family',
  EMERGENCY_RESPONDER: 'emergency responder',
};

/**
 * Who opened the elder's medical details during this emergency, and when. Never what
 * they say: the console oversees who saw health data and has no use for the data. Left
 * out of a closed emergency when nobody opened them, which is most.
 */
function MedicalLooks({ id, version, open }: { id: string; version: number; open: boolean }) {
  const fetcher = useCallback(() => api.medicalViews(id), [id]);
  const { data: looks, reload } = useLoader<Looks>(fetcher, '');
  // Asked again whenever the emergency moves on, which is when somebody new is asked
  // and may look. Not on the first render: the loader has just asked.
  const seen = useRef(version);
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    reload();
  }, [version, reload]);
  const views = looks?.views ?? [];
  const guardian = looks?.sharing?.byElder ? null : (looks?.sharing?.guardian ?? null);
  // Held while the emergency is open, so somebody opening them later fills a line in
  // rather than adding a card.
  if (views.length === 0 && !guardian && !open) return null;

  return (
    <section className="card stack" aria-labelledby="medical-heading">
      <h2 id="medical-heading">Medical details</h2>
      {guardian ? (
        <p>
          Shared because {guardian.by?.name ?? 'a caregiver who has since left'} said this elder
          can&apos;t decide for themselves and acts for them, since {formatClock(guardian.at)}.
        </p>
      ) : null}
      {views.map((view, index) => (
        <p key={`${view.at}-${index}`}>
          {view.by ? view.by.name : 'Someone who has since left'}
          {view.by && ROLE_WORD[view.by.role] ? ` (${ROLE_WORD[view.by.role]})` : ''} opened them at{' '}
          {formatClock(view.at)}.
        </p>
      ))}
      {views.length === 0 && !guardian ? (
        <p className="muted">Nobody has opened them yet.</p>
      ) : null}
    </section>
  );
}

const capitalised = (text: string): string => `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;

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
 * Whether an element is short enough to stay in view under the page's bar, measured as it
 * and the window change size, and again when what it shows changes.
 */
function useFits(element: React.RefObject<HTMLElement | null>, content: unknown): boolean {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const target = element.current;
    if (!target || typeof ResizeObserver === 'undefined') return;
    const measure = () => setFits(target.offsetHeight + 120 <= window.innerHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [element, content]);
  return fits;
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
