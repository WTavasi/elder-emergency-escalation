import { useId } from 'react';
import type { Country } from './country';
import { flagOf } from './country';
import { COUNTRIES } from './countries';

/**
 * A phone number field with the country chosen beside it, Kenya to begin with. The
 * country list is a native select, so it is keyboard operable, searchable by typing
 * the country's name, and read properly by a screen reader without any of that being
 * written by hand.
 */
export function PhoneInput({
  id,
  label,
  country,
  value,
  onCountryChange,
  onChange,
}: {
  id: string;
  label: string;
  country: Country;
  value: string;
  onCountryChange: (country: Country) => void;
  onChange: (value: string) => void;
}) {
  const countryId = useId();

  return (
    <div className="phone-input">
      <label htmlFor={id}>{label}</label>
      <div className="phone-input__row">
        <label className="visually-hidden" htmlFor={countryId}>
          Country code
        </label>
        <select
          id={countryId}
          className="phone-input__country"
          value={country.iso}
          onChange={(event) => {
            const next = COUNTRIES.find((c) => c.iso === event.target.value);
            if (next) onCountryChange(next);
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {flagOf(c.iso)} {c.name} +{c.dial}
            </option>
          ))}
        </select>
        <input
          id={id}
          name="phone"
          type="tel"
          autoComplete="tel-national"
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
