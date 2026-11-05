import type { AuditEntry, ChainMember, DeliveryAttempt } from '../api/types';
import { SERVICE_LABEL, TYPE_LABEL, severityWord, timeAway } from './format';

/** The parts of an audit entry's detail that a sentence can use. Every field is optional. */
interface Detail {
  tier?: number;
  fromTier?: number;
  toTier?: number;
  recipients?: number;
  via?: string;
  trigger?: string;
  reason?: string;
  score?: number;
  band?: string;
  stage?: string;
  severityBefore?: string;
  severityAfter?: string;
  channel?: string;
  notificationId?: string;
  type?: string;
  name?: string;
  seconds?: number;
  byRoad?: boolean;
  service?: string;
  early?: boolean;
}

function detailOf(entry: AuditEntry): Detail {
  return typeof entry.detail === 'object' && entry.detail !== null ? (entry.detail as Detail) : {};
}

/** What the record knows besides the entry itself: who sits where, and what was sent. */
export interface TimelineContext {
  chain: ChainMember[];
  deliveries: DeliveryAttempt[];
}

/**
 * One step of an emergency's record as a sentence a person reads, the same words the app
 * uses: "Sent to Aisha Wanjiru and Brian Wanjiru" rather than "tier dispatched notified to
 * notified". The console also says the two things the app leaves out, because an
 * administrator is the person they are for: how the emergency was scored, and a message
 * that could not be delivered.
 */
export function timelineSentence(entry: AuditEntry, context: TimelineContext): string {
  const detail = detailOf(entry);
  const who = entry.actor?.name ?? 'Someone';
  const byText = detail.via === 'sms';

  switch (entry.action) {
    case 'EVENT_CREATED':
      if (detail.trigger === 'MISSED_CHECK_IN') return 'Missed the daily check-in';
      return byText ? `${who} asked for help, by text` : `${who} asked for help`;
    case 'SEVERITY_EVALUATED':
      return scored(detail);
    case 'TIER_DISPATCHED':
      return dispatched(detail, context.chain);
    case 'NOTIFICATION_FAILED':
      return failed(detail, context.deliveries);
    case 'ESCALATED':
      return escalated(detail, context.chain);
    case 'CHECKED_IN_LATE':
      return `${who} answered the check-in late`;
    case 'VOLUNTEERS_ASKED':
      return 'Asked volunteers nearby';
    case 'VOLUNTEER_ACCEPTED':
      return `${who} (volunteer) is going`;
    case 'VOLUNTEER_WITHDREW':
      return `${who} (volunteer) can no longer go`;
    case 'VOLUNTEER_ARRIVED':
      return `${who} (volunteer) arrived`;
    case 'ACKNOWLEDGED':
      return byText ? `${who} is on the way, by text` : `${who} is on the way`;
    case 'ARRIVED':
      return `${who} arrived`;
    case 'VOICE_JOINED':
      return `${who} joined the call`;
    case 'DECLINED':
      return byText ? `${who} cannot come, by text` : `${who} cannot come`;
    case 'RESPONDER_REQUESTED':
      return `${who} asked for an emergency responder`;
    case 'TYPE_REPORTED':
      return reported(who, detail, byText);
    case 'STATION_ASKED':
      return stationAsked(detail);
    case 'SERVICE_DISPATCHED':
      return dispatchedService(detail);
    case 'RESOLVED':
      return `${who} closed it`;
    case 'CANCELLED':
      return detail.reason === 'checked-in-late'
        ? `Cancelled: ${who} answered the check-in`
        : `${who} cancelled it`;
    case 'REOPENED':
      return `${who} reopened it`;
    default:
      // An action added on the server after this was written. Better a tidied version of
      // the real name than a blank line pretending nothing happened.
      return titleCase(entry.action);
  }
}

/** Relative to the alert, in units a person reads without counting zeroes. */
export function afterTheAlert(seconds: number): string {
  if (seconds <= 0) return 'At the start';
  const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (seconds < 60) return `${count(seconds, 'second')} after the alert`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${count(minutes, 'minute')} after the alert`;
  return `${count(Math.floor(minutes / 60), 'hour')} after the alert`;
}

/** "Scored critical, 60", and on the second scoring, whether the band changed. */
function scored(detail: Detail): string {
  if (!detail.band || detail.score === undefined) return 'Scored for severity';
  const band = severityWord(detail.band).toLowerCase();
  if (detail.stage !== 'cancel_window_closed') return `Scored ${band}, ${detail.score}`;
  const before = detail.severityBefore
    ? severityWord(detail.severityBefore).toLowerCase()
    : undefined;
  const changed = before && before !== band ? `, was ${before}` : '';
  return `Scored again once the cancel window closed: ${band}, ${detail.score}${changed}`;
}

/** Names the people at the tier, because "Sent to Mary Otieno" says more than "tier 1". */
function dispatched(detail: Detail, chain: ChainMember[]): string {
  const tier = detail.tier ?? detail.fromTier;
  if (tier === undefined) return 'Sent to group 1';
  const names = chain.filter((member) => member.priorityOrder === tier).map((m) => m.name);
  if (names.length === 0) {
    const count = detail.recipients ?? 0;
    return count === 1 ? 'Sent to 1 person' : `Sent to ${count} people`;
  }
  return `Sent to ${list(names)}`;
}

function escalated(detail: Detail, chain: ChainMember[]): string {
  if (detail.toTier === undefined) return 'No answer. No one else to ask';
  const names = chain
    .filter((member) => member.priorityOrder === detail.toTier)
    .map((member) => member.name);
  return names.length === 0
    ? 'No answer in time. Asking the next group'
    : `No answer in time. Now asking ${list(names)}`;
}

/** "A push to Mary Otieno could not be delivered: no registered device". */
function failed(detail: Detail, deliveries: DeliveryAttempt[]): string {
  const delivery = deliveries.find((attempt) => attempt.id === detail.notificationId);
  const what = detail.channel === 'SMS' ? 'A text' : 'A push';
  const to = delivery?.recipient ? ` to ${delivery.recipient.name}` : '';
  const why = detail.reason ? `: ${detail.reason}` : '';
  return `${what}${to} could not be delivered${why}`;
}

/** "Grace said it is a fire", and what that did to severity. */
function reported(who: string, detail: Detail, byText: boolean): string {
  const what = detail.type ? (TYPE_LABEL[detail.type] ?? detail.type).toLowerCase() : 'something';
  const how = byText ? ', by text' : '';
  const raised =
    detail.severityBefore && detail.severityAfter && detail.severityBefore !== detail.severityAfter
      ? `. Raised to ${severityWord(detail.severityAfter).toLowerCase()}`
      : '';
  return `${who} said: ${what}${how}${raised}`;
}

/** "The fire service was asked at once", or that nobody of it covers the place. */
function dispatchedService(detail: Detail): string {
  const service = detail.service ? (SERVICE_LABEL[detail.service] ?? detail.service) : 'A service';
  return detail.recipients === 0
    ? `No ${service.toLowerCase()} covers the place, so volunteers nearby were asked`
    : `${service} asked at once`;
}

/** "Kilimani Police Station asked, about 6 minutes away by road", and why it was asked. */
function stationAsked(detail: Detail): string {
  const who = detail.name ?? 'A station';
  const away =
    typeof detail.seconds === 'number'
      ? `, ${timeAway(detail.seconds)} away${detail.byRoad ? ' by road' : ''}`
      : '';
  const why =
    detail.reason === 'declined'
      ? ' after the one before could not come'
      : detail.reason === 'no-answer'
        ? ' after no answer from the one before'
        : '';
  return `${who} asked${away}${why}`;
}

/** "Aisha", "Aisha and Brian", "Aisha, Brian and Kevin". */
function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function titleCase(action: string): string {
  const spaced = action.toLowerCase().replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
