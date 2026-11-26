import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AlertSummary, UserRow } from '../api/types';
import { OPEN_STATES } from '../api/types';
import { useDebounced } from '../hooks/useDebounced';
import { SECTIONS } from '../navigation';
import { useOpenAlertsIfAny } from '../state/OpenAlerts';
import { formatClock, humanise } from '../utils/format';
import { Icon, type IconName } from './Icon';

type Group = 'Open emergencies' | 'Go to' | 'People' | 'Past emergencies' | 'Search';

interface Item {
  id: string;
  group: Group;
  icon: IconName;
  label: string;
  detail?: string;
  /** The keys that do the same from anywhere, shown beside it so they are learnt. */
  keys?: string[];
  to: string;
}

const GROUPS: Group[] = ['Open emergencies', 'Go to', 'People', 'Past emergencies', 'Search'];

const matches = (text: string, query: string) =>
  text.toLowerCase().includes(query.trim().toLowerCase());

/**
 * One search across the console, opened with ⌘K (Ctrl K elsewhere) or the Search button
 * in the sidebar: type part of a name and go straight to an open emergency, a section, a
 * person's account or an emergency in the history, without going through the pages.
 *
 * Sections and open emergencies are matched at once from what the console already has;
 * people and past emergencies are asked of the API once the typing pauses. The arrow
 * keys move through the results, Return goes, and Escape closes. Built as a combobox
 * with a list box, so a screen reader hears each result as it is reached.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const liveAlerts = useOpenAlertsIfAny()?.alerts;
  const openAlerts = useMemo(() => liveAlerts ?? [], [liveAlerts]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<UserRow[]>([]);
  const [past, setPast] = useState<AlertSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const listId = useId();
  const asked = useDebounced(query, 200);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    field.current?.focus();
    return () => opener?.focus();
  }, []);

  // People and past emergencies, from the API, for two letters or more. An answer to a
  // search already replaced is dropped.
  useEffect(() => {
    const words = asked.trim();
    if (words.length < 2) return;
    let live = true;
    Promise.allSettled([
      api.users.list({ q: words, pageSize: 5 }),
      api.alertPage({ q: words, limit: 5 }),
    ]).then(([users, alerts]) => {
      if (!live) return;
      setPeople(users.status === 'fulfilled' ? users.value.items : []);
      setPast(alerts.status === 'fulfilled' ? alerts.value.items : []);
      setSearching(false);
    });
    return () => {
      live = false;
    };
  }, [asked]);

  const items = useMemo<Item[]>(() => {
    const words = query.trim();
    const open = openAlerts
      .filter((alert) => !words || matches(alert.elder.name, words))
      .slice(0, 5)
      .map<Item>((alert) => ({
        id: `open-${alert.eventId}`,
        group: 'Open emergencies',
        icon: 'emergency',
        label: alert.elder.name,
        detail: `${humanise(alert.state)}, raised ${formatClock(alert.triggeredAt)}`,
        to: `/emergencies/${alert.eventId}`,
      }));
    const sections = SECTIONS.filter(
      (section) => !words || matches(section.label, words),
    ).map<Item>((section) => ({
      id: `go-${section.to}`,
      group: 'Go to',
      icon: section.icon,
      label: section.label,
      keys: ['G', section.key.toUpperCase()],
      to: section.to,
    }));
    if (words.length < 2) return [...open, ...sections];

    const openIds = new Set(openAlerts.map((alert) => alert.eventId));
    const found = people.map<Item>((person) => ({
      id: `person-${person.id}`,
      group: 'People',
      icon: 'person',
      label: person.name,
      detail: [humanise(person.role), person.phone].filter(Boolean).join(', '),
      to: `/users?q=${encodeURIComponent(person.name)}`,
    }));
    const earlier = past
      .filter((alert) => !openIds.has(alert.eventId) && !OPEN_STATES.includes(alert.state))
      .map<Item>((alert) => ({
        id: `past-${alert.eventId}`,
        group: 'Past emergencies',
        icon: 'history',
        label: alert.elder.name,
        detail: `${humanise(alert.state)}, raised ${formatClock(alert.triggeredAt)}`,
        to: `/emergencies/${alert.eventId}`,
      }));
    const everywhere: Item[] = [
      {
        id: 'search-history',
        group: 'Search',
        icon: 'search',
        label: `Search the history for “${words}”`,
        to: `/history?q=${encodeURIComponent(words)}`,
      },
      {
        id: 'search-users',
        group: 'Search',
        icon: 'search',
        label: `Search accounts for “${words}”`,
        to: `/users?q=${encodeURIComponent(words)}`,
      },
    ];
    return [...open, ...sections, ...found, ...earlier, ...everywhere];
  }, [query, openAlerts, people, past]);

  const current = Math.min(active, Math.max(0, items.length - 1));
  const optionId = (index: number) => `${listId}-option-${index}`;

  // The chosen result kept in view as the arrow keys move past the edge of the list.
  useEffect(() => {
    document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' });
  });

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    void navigate(item.to);
  }

  function onKeyDown(keyEvent: React.KeyboardEvent<HTMLInputElement>) {
    if (keyEvent.key === 'ArrowDown' || keyEvent.key === 'ArrowUp') {
      keyEvent.preventDefault();
      const step = keyEvent.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + items.length) % Math.max(1, items.length));
    } else if (keyEvent.key === 'Enter') {
      keyEvent.preventDefault();
      go(items[current]);
    } else if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      onClose();
    } else if (keyEvent.key === 'Tab') {
      // Nothing else in the panel takes focus: the results are reached with the arrows.
      keyEvent.preventDefault();
    }
  }

  let index = -1;

  return (
    <div className="palette" role="presentation">
      <div className="modal__scrim" aria-hidden="true" onClick={onClose} />
      <div className="palette__box" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette__field">
          <Icon name="search" size={18} />
          <input
            ref={field}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items.length ? optionId(current) : undefined}
            aria-autocomplete="list"
            aria-label="Search people, emergencies and sections"
            placeholder="Search people, emergencies and sections"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(changeEvent) => {
              const next = changeEvent.target.value;
              setQuery(next);
              setActive(0);
              if (next.trim().length >= 2) setSearching(true);
              else {
                setPeople([]);
                setPast([]);
                setSearching(false);
              }
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="palette__esc">esc</kbd>
        </div>

        <div className="palette__results" id={listId} role="listbox" aria-label="Results">
          {GROUPS.map((group) => {
            const inGroup = items.filter((item) => item.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} role="group" aria-label={group} className="palette__group">
                <div className="palette__group-name" aria-hidden="true">
                  {group}
                </div>
                {inGroup.map((item) => {
                  index += 1;
                  const mine = index;
                  return (
                    <div
                      key={item.id}
                      id={optionId(mine)}
                      role="option"
                      aria-selected={mine === current}
                      className="palette__option"
                      onMouseMove={() => setActive(mine)}
                      onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
                      onClick={() => go(item)}
                    >
                      <Icon name={item.icon} size={18} />
                      <span className="palette__label">
                        {item.label}
                        {item.detail ? (
                          <span className="palette__detail">{item.detail}</span>
                        ) : null}
                      </span>
                      {item.keys ? (
                        <span
                          className="palette__keys"
                          aria-label={`Shortcut ${item.keys.join(' then ')}`}
                        >
                          {item.keys.map((key) => (
                            <kbd key={key}>{key}</kbd>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {items.length === 0 ? <p className="palette__none">Nothing matches.</p> : null}
        </div>

        <p className="palette__foot" aria-live="polite">
          {searching ? 'Searching people and the history…' : 'Arrow keys to move, Return to go.'}
        </p>
      </div>
    </div>
  );
}
