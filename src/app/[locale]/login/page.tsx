'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { useRouter } from '@/i18n/navigation';
import { ApiClientError, api, apiErrorMessageKey } from '@/lib/api/client';
import { MAX_PHONE_INPUT_LENGTH } from '@/lib/phone';
import { resolveSafeNext } from '@/lib/safeNext';

import type { ApiErrorCode } from '@/lib/http';

// API.md: a code is always 6 digits; a display name is 2-50 chars. Not
// imported from src/lib/auth/otp.ts / users.ts — those pull in the db
// client and node:crypto, which have no place in a browser bundle.
const CODE_LENGTH = 6;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 50;

const DEFAULT_RESEND_COOLDOWN_SECONDS = 30;

type Step = 'phone' | 'code' | 'name';

/** Sign in: phone → OTP code → (new users only) display name. */
export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeNext = resolveSafeNext(searchParams.get('next')) ?? '/';

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const [phoneError, setPhoneError] = useState<ApiErrorCode | null>(null);
  const [codeError, setCodeError] = useState<ApiErrorCode | null>(null);
  const [nameError, setNameError] = useState<ApiErrorCode | null>(null);
  const [formError, setFormError] = useState<ApiErrorCode | null>(null);

  // A self-rescheduling countdown: each tick sets state one second lower,
  // which re-runs this effect and schedules the next tick, until it hits
  // 0 and the effect declines to schedule another. `setState` only ever
  // happens inside the timer callback, never synchronously in the effect
  // body itself.
  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const id = setTimeout(() => setCooldownSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldownSeconds]);

  // `apiErrorMessageKey` returns a plain `string` — it lives in
  // src/lib/api/client.ts, shared with server code that has no reason to
  // depend on next-intl's generated message types. The cast is narrow and
  // sits in exactly one place; src/i18n/messages.test.ts is what actually
  // guarantees every ApiErrorCode resolves to a real key.
  function errorText(code: ApiErrorCode): string {
    return t(apiErrorMessageKey(code) as Parameters<typeof t>[0]);
  }

  function clearErrors() {
    setPhoneError(null);
    setCodeError(null);
    setNameError(null);
    setFormError(null);
  }

  /**
   * Order matters and is not interchangeable. `router.refresh()` re-fetches
   * data for the CURRENT route (still /login at the moment this runs); if it
   * ran first, `router.push()` navigates away before that refetch can apply,
   * discarding it. And `push()` alone isn't enough either — a client-side
   * navigation to a page under the same already-mounted layout swaps only
   * the page segment, not the layout, so the header (rendered by the layout,
   * from SessionProvider) would keep showing the pre-sign-in session.
   * `push()` first, then `refresh()` (now against the destination, which is
   * "current" by the time it runs) re-fetches the whole tree — layout
   * included — with the session cookie that verifyOtp just set. Verified in
   * a real browser: without this order, the header still reads "log in" on
   * the destination page until a full reload.
   */
  function completeSignIn() {
    router.push(safeNext);
    router.refresh();
  }

  /** CODE_EXPIRED and TOO_MANY_ATTEMPTS kill the code outright (API.md) —
   * there is no field left to fix, so this is the only way out. */
  function sendBackToPhoneStep(code: ApiErrorCode) {
    setStep('phone');
    setCode('');
    setFormError(code);
  }

  async function requestCode(phoneValue: string): Promise<boolean> {
    try {
      await api.auth.requestOtp({ phone: phoneValue });
      setCooldownSeconds(DEFAULT_RESEND_COOLDOWN_SECONDS);
      return true;
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'RATE_LIMITED') {
          setCooldownSeconds(error.retryAfterSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS);
          setFormError(error.code);
        } else if (error.code === 'INVALID_PHONE') {
          setPhoneError(error.code);
        } else {
          setFormError(error.code);
        }
      } else {
        setFormError('INTERNAL');
      }
      return false;
    }
  }

  async function handlePhoneSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    clearErrors();
    setSubmitting(true);
    const ok = await requestCode(phone);
    setSubmitting(false);

    if (ok) setStep('code');
  }

  async function handleResend() {
    if (submitting || cooldownSeconds > 0) return;

    clearErrors();
    setSubmitting(true);
    const ok = await requestCode(phone);
    setSubmitting(false);

    if (ok) setCode('');
  }

  async function handleCodeSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    clearErrors();
    setSubmitting(true);
    try {
      const result = await api.auth.verifyOtp({ phone, code });

      if (result.isNewUser) {
        setStep('name');
      } else {
        completeSignIn();
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'CODE_EXPIRED' || error.code === 'TOO_MANY_ATTEMPTS') {
          sendBackToPhoneStep(error.code);
        } else if (error.code === 'INVALID_CODE') {
          setCodeError(error.code);
        } else {
          setFormError(error.code);
        }
      } else {
        setFormError('INTERNAL');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNameSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    clearErrors();
    setSubmitting(true);
    try {
      const result = await api.auth.verifyOtp({ phone, code, displayName });

      if (result.isNewUser) {
        // The server never returns isNewUser again once a name was sent —
        // this would mean the code died between steps. Same recovery.
        sendBackToPhoneStep('CODE_EXPIRED');
      } else {
        completeSignIn();
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (
          error.code === 'CODE_EXPIRED' ||
          error.code === 'TOO_MANY_ATTEMPTS' ||
          error.code === 'INVALID_CODE'
        ) {
          // No code field on this step to show INVALID_CODE inline against.
          sendBackToPhoneStep(error.code);
        } else if (error.code === 'NAME_REQUIRED') {
          setNameError(error.code);
        } else {
          setFormError(error.code);
        }
      } else {
        setFormError('INTERNAL');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackToPhone() {
    clearErrors();
    setStep('phone');
    setCode('');
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold">{t('pages.login')}</h1>

        {formError && (
          <p className="mb-4 text-sm text-red-700" role="alert">
            {errorText(formError)}
          </p>
        )}

        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-3" noValidate>
            <label htmlFor="phone" className="text-sm font-medium">
              {t('login.phone.label')}
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={MAX_PHONE_INPUT_LENGTH}
              placeholder={t('login.phone.placeholder')}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
              required
            />
            {phoneError && <p className="text-sm text-red-700">{errorText(phoneError)}</p>}
            <button
              type="submit"
              disabled={submitting || phone.trim().length === 0}
              className="rounded bg-brand px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {t('login.phone.submit')}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="flex flex-col gap-3" noValidate>
            <p className="text-sm text-neutral-600">{t('login.code.description', { phone })}</p>
            <label htmlFor="code" className="text-sm font-medium">
              {t('login.code.label')}
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className="rounded border border-neutral-300 px-3 py-2 text-sm tracking-widest"
              required
            />
            {codeError && <p className="text-sm text-red-700">{errorText(codeError)}</p>}
            <button
              type="submit"
              disabled={submitting || code.length !== CODE_LENGTH}
              className="rounded bg-brand px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {t('login.code.submit')}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleBackToPhone}
                className="text-brand-strong hover:underline"
              >
                {t('login.code.back')}
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={submitting || cooldownSeconds > 0}
                className="text-brand-strong hover:underline disabled:text-neutral-400 disabled:no-underline"
              >
                {cooldownSeconds > 0
                  ? t('login.code.resendIn', { seconds: cooldownSeconds })
                  : t('login.code.resend')}
              </button>
            </div>
          </form>
        )}

        {step === 'name' && (
          <form onSubmit={handleNameSubmit} className="flex flex-col gap-3" noValidate>
            <p className="text-sm text-neutral-600">{t('login.name.description')}</p>
            <label htmlFor="displayName" className="text-sm font-medium">
              {t('login.name.label')}
            </label>
            <input
              id="displayName"
              type="text"
              autoComplete="name"
              minLength={NAME_MIN_LENGTH}
              maxLength={NAME_MAX_LENGTH}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
              required
            />
            {nameError && <p className="text-sm text-red-700">{errorText(nameError)}</p>}
            <button
              type="submit"
              disabled={submitting || displayName.trim().length < NAME_MIN_LENGTH}
              className="rounded bg-brand px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {t('login.name.submit')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
