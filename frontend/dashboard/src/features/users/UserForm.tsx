import { useState } from 'react';
import { ApiError, api } from '../../shared/api/client';
import type { AddressMatch, Coverage, NewUser, UserRow } from '../../shared/api/types';
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
 * Editing changes the name, the email and, for a responder, the area. The phone number
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
  const [areaQuery, setAreaQuery] = useState('');
  const [matches, setMatches] = useState<AddressMatch[] | null>(null);
  const [attribution, setAttribution] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isResponder = editing
    ? user.role === 'EMERGENCY_RESPONDER'
    : role === 'EMERGENCY_RESPONDER';

  async function searchArea() {
    if (areaQuery.trim().length < 3) {
      setError('Type at least three letters of a place to search for.');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const found = await api.searchAddress(areaQuery.trim());
      setMatches(found.results);
      setAttribution(found.attribution);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not search. Try again.');
    } finally {
      setSearching(false);
    }
  }

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
        ...(isResponder && coverage ? { coverage } : {}),
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
          <button type="button" className="button--quiet" onClick={onClose}>
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
        <p className="muted micro" style={{ marginTop: 0 }}>
          For emergency responders and administrators. Caregivers and family members sign themselves
          up in the app, and elders are registered by their caregiver.
        </p>
      ) : null}

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      {!editing ? (
        <div className="field">
          <label htmlFor="user-role">Role</label>
          <select
            id="user-role"
            value={role}
            onChange={(changeEvent) => setRole(changeEvent.target.value as NewUser['role'])}
          >
            <option value="EMERGENCY_RESPONDER">Emergency responder</option>
            <option value="ADMINISTRATOR">Administrator</option>
          </select>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="user-name">Name</label>
        <input
          id="user-name"
          autoComplete="off"
          value={name}
          onChange={(changeEvent) => setName(changeEvent.target.value)}
        />
      </div>

      {editing ? (
        <div className="field">
          <span className="label">Phone number</span>
          <p className="figures" style={{ margin: 0 }}>
            {user.phone}
          </p>
          <p className="field__hint">
            Not changed here: it is how they sign in and how every chain reaches them.
          </p>
        </div>
      ) : (
        <div className="field">
          <PhoneInput
            id="user-phone"
            label="Phone number"
            country={country}
            value={phone}
            onCountryChange={setCountry}
            onChange={setPhone}
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="user-email">Email (optional)</label>
        <input
          id="user-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(changeEvent) => setEmail(changeEvent.target.value)}
        />
        {role === 'ADMINISTRATOR' && !editing ? (
          <p className="field__hint">An administrator can sign in to the console with it.</p>
        ) : null}
      </div>

      {!editing ? (
        <div className="field">
          <label htmlFor="user-password">First password</label>
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
      ) : null}

      {isResponder ? (
        <fieldset className="field fieldset">
          <legend>Area they cover</legend>
          {coverage ? (
            <p style={{ margin: '0 0 var(--space-8)' }}>
              <strong>{coverage.areaName}</strong>{' '}
              <span className="figures micro">
                {coverage.latitude.toFixed(4)}, {coverage.longitude.toFixed(4)}
              </span>
            </p>
          ) : (
            <p className="muted micro" style={{ margin: '0 0 var(--space-8)' }}>
              No area chosen yet.
            </p>
          )}
          <div className="row">
            <label className="visually-hidden" htmlFor="user-area">
              Search for a place
            </label>
            <input
              id="user-area"
              style={{ flex: 1, width: 'auto' }}
              placeholder="Search for a place, e.g. Kilimani, Nairobi"
              value={areaQuery}
              onChange={(changeEvent) => setAreaQuery(changeEvent.target.value)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === 'Enter') {
                  keyEvent.preventDefault();
                  void searchArea();
                }
              }}
            />
            <button type="button" onClick={() => void searchArea()} disabled={searching}>
              {searching ? 'Searching' : 'Search'}
            </button>
          </div>
          {matches !== null ? (
            matches.length === 0 ? (
              <p className="muted micro">Nothing found. Try a nearby town or estate.</p>
            ) : (
              <>
                <ul className="choices">
                  {matches.map((match) => (
                    <li key={`${match.latitude},${match.longitude}`}>
                      <label>
                        <input
                          type="radio"
                          name="area"
                          checked={
                            coverage?.latitude === match.latitude &&
                            coverage?.longitude === match.longitude
                          }
                          onChange={() => choose(match)}
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
          {coverage ? (
            <div className="row" style={{ marginTop: 'var(--space-12)' }}>
              <label htmlFor="user-radius" style={{ margin: 0 }}>
                Radius
              </label>
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
          ) : null}
        </fieldset>
      ) : null}
    </Modal>
  );
}
