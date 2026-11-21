'use client';

import { useEffect, useState } from 'react';
import { getToken, setToken } from '../lib/token';

/** Lets a user paste the access token for this browser tab (kept in sessionStorage, never in the code or the URL). */
export function TokenField() {
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState('');
  useEffect(() => setSaved(getToken() !== ''), []);
  return (
    <div className="token">
      <label htmlFor="token-input" className="visually-hidden">
        Access token
      </label>
      {saved ? (
        <>
          <span>Access token set for this tab</span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setToken('');
              setSaved(false);
            }}
          >
            Clear
          </button>
        </>
      ) : (
        <>
          <input
            id="token-input"
            type="password"
            placeholder="Access token (optional)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="secondary"
            disabled={!value}
            onClick={() => {
              setToken(value.trim());
              setValue('');
              setSaved(true);
            }}
          >
            Use
          </button>
        </>
      )}
    </div>
  );
}
