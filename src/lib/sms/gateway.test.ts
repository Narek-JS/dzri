import { afterEach, describe, expect, it, vi } from 'vitest';

import { gatewaySmsProvider } from './gateway';
import { SmsError } from './types';

/**
 * Never hits msg.messaggio.com — `fetch` is stubbed in every test. If a
 * case here ever reaches the network, that is itself the bug: NODE_ENV is
 * 'test' under vitest, so nothing outside this file should route here
 * anyway (see index.ts), but the provider must not depend on that.
 */
describe('gatewaySmsProvider', () => {
  const originalLogin = process.env.MESSAGGIO_PROJECT_LOGIN;
  const originalSender = process.env.MESSAGGIO_SENDER_CODE;

  const LOGIN = 'test-project-login';
  const SENDER = 'test-sender';

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalLogin === undefined) delete process.env.MESSAGGIO_PROJECT_LOGIN;
    else process.env.MESSAGGIO_PROJECT_LOGIN = originalLogin;

    if (originalSender === undefined) delete process.env.MESSAGGIO_SENDER_CODE;
    else process.env.MESSAGGIO_SENDER_CODE = originalSender;
  });

  function stubFetch(response: Response): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('throws without calling fetch when credentials are not configured', async () => {
    delete process.env.MESSAGGIO_PROJECT_LOGIN;
    delete process.env.MESSAGGIO_SENDER_CODE;
    const fetchMock = stubFetch(new Response('', { status: 200 }));

    await expect(gatewaySmsProvider.send('+37477123456', 'hello')).rejects.toThrow(SmsError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the confirmed request shape and resolves on 2xx', async () => {
    process.env.MESSAGGIO_PROJECT_LOGIN = LOGIN;
    process.env.MESSAGGIO_SENDER_CODE = SENDER;
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ accepted_at: 'now', messages: [] }), { status: 200 }),
    );

    await expect(gatewaySmsProvider.send('+37477123456', 'hello')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://msg.messaggio.com/api/v1/send');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Messaggio-Login': LOGIN,
    });
    // Confirmed via a live test: no signature or secret-key header.
    expect(Object.keys(init.headers as Record<string, string>).map((h) => h.toLowerCase())).not.toContain(
      'x-signature',
    );

    expect(JSON.parse(init.body as string)).toEqual({
      recipients: [{ phone: '+37477123456' }],
      channels: ['sms'],
      sms: { from: SENDER, content: [{ type: 'text', text: 'hello' }] },
    });
  });

  it('throws SmsError on a non-2xx response', async () => {
    process.env.MESSAGGIO_PROJECT_LOGIN = LOGIN;
    process.env.MESSAGGIO_SENDER_CODE = SENDER;
    stubFetch(new Response('{"error":"bad sender"}', { status: 400 }));

    await expect(gatewaySmsProvider.send('+37477123456', 'hello')).rejects.toThrow(SmsError);
  });

  it('throws SmsError when the network request itself fails', async () => {
    process.env.MESSAGGIO_PROJECT_LOGIN = LOGIN;
    process.env.MESSAGGIO_SENDER_CODE = SENDER;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(gatewaySmsProvider.send('+37477123456', 'hello')).rejects.toThrow(SmsError);
  });
});
