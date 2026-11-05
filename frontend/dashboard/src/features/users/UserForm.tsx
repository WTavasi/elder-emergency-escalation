import { useState } from 'react';
import { ApiError, api } from '../../shared/api/client';
import type {
  AddressMatch,
  Coverage,
  NewUser,
  ResponderService,
  Station,
  UserRow,
} from '../../shared/api/types';
import { SERVICE_LABEL } from '../../shared/utils/format';
import { Modal } from '../../shared/components/Modal';
import { PhoneInput } from '../../shared/phone/PhoneInput';
import { DEFAULT_COUNTRY, readPhone } from '../../shared/phone/read-phone';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Adding a responder or an administrator, or changing one account's details.
 *
 * Adding asks for a first password, which the administrator hands over in person: the
 * person is told by SMS that the account exists, and never told the password by text.
 * A responder also needs an area, found by address search, because dispatch picks
 * responders by whether an emergency falls inside their circle.
 *
 * A responder can also have a station, the address the unit is based at, found the same
 * way, because the nearest station by road is asked first.
 *
 * Editing changes the name, the email and, for a responder, the area and station. The phone number
 * and the role are not edited here: the number is how the person signs in and how
 * every chain reaches them, and a change of role is a different person's job.
 */
export function UserForm({
  user,
  onClose,
  onSaved,
}: {
  /** The account to edit, or nothing to add one. */
  user: UserRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = user !== null;
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<NewUser['role']>(
    user?.role === 'ADMINISTRATOR' ? 'ADMINISTRATOR' : 'EMERGENCY_RESPONDER',
  );
  const [password, setPassword] = useState('');
  const [coverage, setCoverage] = useState<Coverage | null>(user?.coverage ?? null);
  const [service, setService] = useState<ResponderService>(user?.responderService ?? 'GENERAL');
  const [station, setStation] = useState<Station | null>(user?.station ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isResponder = editing
    ? user.role === 'EMERGENCY_RESPONDER'
    : role === 'EMERGENCY_RESPONDER';

  function choose(match: AddressMatch) {
    setCoverage({
      areaName: match.label.split(',')[0]?.trim() || match.label,
      latitude: match.latitude,
      longitude: match.longitude,
      radiusKm: coverage?.radiusKm ?? 5,
    });
  }

  async function save() {
    setError(null);
    if (name.trim().length < 2) return setError('Enter their name.');
    if (email.trim() && !EMAIL.test(email.trim())) {
      return setError('That does not look like an email address.');
    }
    if (isResponder && !coverage) {
      return setError('Choose the area they cover. Dispatch picks responders by area.');
    }

    setBusy(true);
    try {
      if (editing) {
        await api.users.update(user.id, {
          name: name.trim(),
          email: email.trim() || null,
          ...(isResponder && coverage ? { coverage } : {}),
          ...(isResponder ? { responderService: service, station } : {}),
        });
        onSaved(`${name.trim()} was updated.`);
        return;
      }

      const reading = readPhone(country, phone);
      if (reading.problem !== null) {
        setBusy(false);
        return setError(reading.problem);
      }
      if (password.length < 8) {
        setBusy(false);
        return setError('The first password needs at least 8 characters.');
      }
      await api.users.create({
        name: name.trim(),
        phone: reading.e164,
        ...(email.trim() ? { email: email.trim() } : {}),
        role,
        password,
        ...(isResponder && coverage
          ? { coverage, responderService: service, ...(station ? { station } : {}) }
          : {}),
      });
      onSaved(`${name.trim()} was added and sent an SMS saying so. Give them their password.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${user.name}` : 'Add a user'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button--primary"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? 'Saving' : editing ? 'Save changes' : 'Add user'}
          </button>
        </>
      }
    >
      {!editing ? (
        <p className="muted micro">
          For emergency responders and administrators. Caregivers and family members sign themselves
          up in the app, and elders are registered by their caregiver.
        </p>
      ) : null}

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="form-grid">
        {!editing ? (
          <>
            <span className="label" id="user-role-label">
              Role
            </span>
            {/* Two choices, side by side, as Apple offers a choice between two. */}
            <div
              className="segmented segmented--fill"
              role="group"
              aria-labelledby="user-role-label"
            >
              <button
                type="button"
                aria-pressed={role === 'EMERGENCY_RESPONDER'}
                onClick={() => setRole('EMERGENCY_RESPONDER')}
              >
                Emergency responder
              </button>
              <button
                type="button"
                aria-pressed={role === 'ADMINISTRATOR'}
                onClick={() => setRole('ADMINISTRATOR')}
              >
                Administrator
              </button>
            </div>
          </>
        ) : null}

        <label htmlFor="user-name">Name</label>
        <input
          id="user-name"
          autoComplete="off"
          value={name}
          onChange={(changeEvent) => setName(changeEvent.target.value)}
        />

        {editing ? (
          <>
            <span className="label form-grid__top">Phone number</span>
            <div>
              <p className="figures" style={{ margin: 0 }}>
                {user.phone}
              </p>
              <p className="field__hint">
                Not changed here: it is how they sign in and how every chain reaches them.
              </p>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="user-phone">Phone number</label>
            <PhoneInput
              id="user-phone"
              label="Phone number"
              labelHidden
              country={country}
              value={phone}
              onCountryChange={setCountry}
              onChange={setPhone}
            />
          </>
        )}

        <label htmlFor="user-email" className="form-grid__top">
          Email
        </label>
        <div>
          <input
            id="user-email"
            type="email"
            autoComplete="off"
            placeholder="Optional"
            value={email}
            onChange={(changeEvent) => setEmail(changeEvent.target.value)}
          />
          {role === 'ADMINISTRATOR' && !editing ? (
            <p className="field__hint">An administrator can sign in to the console with it.</p>
          ) : null}
        </div>

        {!editing ? (
          <>
            <label htmlFor="user-password" className="form-grid__top">
              First password
            </label>
            <div>
              <input
                id="user-password"
                type="text"
                autoComplete="new-password"
                spellCheck={false}
                value={password}
                onChange={(changeEvent) => setPassword(changeEvent.target.value)}
              />
              <p className="field__hint">
                At least 8 characters. Give it to them in person; it is never sent by SMS. They can
                change it from their account.
              </p>
            </div>
          </>
        ) : null}

        {isResponder ? (
          <>
            <label htmlFor="user-service">Service</label>
            <div>
              <select
                id="user-service"
                value={service}
                onChange={(changeEvent) => setService(changeEvent.target.value as ResponderService)}
              >
                {(['GENERAL', 'AMBULANCE', 'FIRE', 'POLICE'] as const).map((value) => (
                  <option key={value} value={value}>
                    {SERVICE_LABEL[value]}
                  </option>
                ))}
              </select>
              <p className="field__hint">
                An alert that says what is happening asks the matching service first. General takes
                any call.
              </p>
            </div>

            <label htmlFor="user-area" className="form-grid__top">
              Area they cover
            </label>
            <div className="stack" style={{ gap: 'var(--space-8)' }}>
              {coverage ? (
                <p style={{ margin: 0 }}>
                  <strong>{coverage.areaName}</strong>{' '}
                  <span className="figures micro">
                    {coverage.latitude.toFixed(4)}, {coverage.longitude.toFixed(4)}
                  </span>
                </p>
              ) : null}
              <PlaceSearch
                id="user-area"
                placeholder="Search for a place, e.g. Kilimani, Nairobi"
                chosen={coverage}
                onChoose={choose}
                onError={setError}
              />
            </div>
            {coverage ? (
              <>
                <label htmlFor="user-radius">Radius</label>
                <div className="row">
                  <input
                    id="user-radius"
                    type="number"
                    min={0.5}
                    max={100}
                    step={0.5}
                    style={{ width: '6rem' }}
                    value={coverage.radiusKm}
                    onChange={(changeEvent) =>
                      setCoverage({ ...coverage, radiusKm: Number(changeEvent.target.value) || 5 })
                    }
                  />
                  <span className="muted">km</span>
                </div>
              </>
            ) : null}

            <label htmlFor="user-station" className="form-grid__top">
              Station
            </label>
            <div className="stack" style={{ gap: 'var(--space-8)' }}>
              {station ? (
                <p style={{ margin: 0 }}>
                  {station.label}{' '}
                  <span className="figures micro">
                    {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
                  </span>{' '}
                  <button type="button" className="link-button" onClick={() => setStation(null)}>
                    Remove
                  </button>
                </p>
              ) : null}
              <PlaceSearch
                id="user-station"
                placeholder="Search for the station's address"
                chosen={station}
                onChoose={(match) =>
                  setStation({
                    label: match.label,
                    latitude: match.latitude,
                    longitude: match.longitude,
                  })
                }
                onError={setError}
              />
              <p className="field__hint">
                Where the unit is based. The nearest station by road is asked first. Without one,
                the middle of the area is used.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * A place, found by address search and chosen from a short list. Used for a responder's
 * area and for their station.
 */
function PlaceSearch({
  id,
  placeholder,
  chosen,
  onChoose,
  onError,
}: {
  id: string;
  placeholder: string;
  chosen: { latitude: number; longitude: number } | null;
  onChoose: (match: AddressMatch) => void;
  onError: (message: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<AddressMatch[] | null>(null);
  const [attribution, setAttribution] = useState('');
  const [searching, setSearching] = useState(false);

  async function search() {
    if (query.trim().length < 3) {
      onError('Type at least three letters of a place to search for.');
      return;
    }
    setSearching(true);
    onError(null);
    try {
      const found = await api.searchAddress(query.trim());
      setMatches(found.results);
      setAttribution(found.attribution);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Couldn't search. Try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id={id}
          style={{ flex: 1, width: 'auto' }}
          placeholder={placeholder}
          value={query}
          onChange={(changeEvent) => setQuery(changeEvent.target.value)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === 'Enter') {
              keyEvent.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" onClick={() => void search()} disabled={searching}>
          {searching ? 'Searching' : 'Search'}
        </button>
      </div>
      {matches !== null ? (
        matches.length === 0 ? (
          <p className="muted micro" style={{ margin: 0 }}>
            Nothing found. Try a nearby town or estate.
          </p>
        ) : (
          <>
            <ul className="choices">
              {matches.map((match) => (
                <li key={`${match.latitude},${match.longitude}`}>
                  <label>
                    <input
                      type="radio"
                      name={id}
                      checked={
                        chosen?.latitude === match.latitude && chosen?.longitude === match.longitude
                      }
                      onChange={() => onChoose(match)}
                    />
                    {match.label}
                  </label>
                </li>
              ))}
            </ul>
            <p className="field__hint">{attribution}</p>
          </>
        )
      ) : null}
    </>
  );
}
