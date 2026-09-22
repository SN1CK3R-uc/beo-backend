import { env } from '../env.js';

const PAYCHANGU_API = 'https://api.paychangu.com';

export interface PayChanguInitiateInput {
  txRef: string;
  amountMWK: number;
  email: string;
  firstName: string;
  lastName?: string;
  title: string;
  description: string;
}

export interface PayChanguInitiateResult {
  checkoutUrl: string;
  txRef: string;
  raw: unknown;
}

export interface PayChanguVerification {
  status: 'success' | 'failed' | 'pending';
  amountMWK: number;
  currency: string;
  txRef: string;
  channel: string;
  raw: unknown;
}

export const paychangu = {
  async initiate(input: PayChanguInitiateInput): Promise<PayChanguInitiateResult> {
    console.log('[paychangu initiate] sending:', {
      txRef: input.txRef,
      amount: input.amountMWK,
      callback_url: env.PAYCHANGU_CALLBACK_URL,
      return_url: env.PAYCHANGU_RETURN_URL,
    });

    const res = await fetch(`${PAYCHANGU_API}/payment`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}`,
      },
      body: JSON.stringify({
        tx_ref: input.txRef,
        amount: input.amountMWK,
        currency: 'MWK',
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName ?? '',
        callback_url: env.PAYCHANGU_CALLBACK_URL,
        return_url: env.PAYCHANGU_RETURN_URL,
        customization: {
          title: input.title,
          description: input.description,
        },
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      console.error('[paychangu initiate] failed:', res.status, text);
      throw new Error(`PayChangu initiate failed (${res.status}): ${text}`);
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('PayChangu returned non-JSON response');
    }

    const checkoutUrl = data?.data?.checkout_url;
    if (!checkoutUrl) {
      console.error('[paychangu initiate] no checkout_url in response:', data);
      throw new Error('PayChangu did not return a checkout_url');
    }

    return { checkoutUrl, txRef: input.txRef, raw: data };
  },

  async verify(txRef: string): Promise<PayChanguVerification> {
    const res = await fetch(
      `${PAYCHANGU_API}/verify-payment/${encodeURIComponent(txRef)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}`,
        },
      },
    );

    const text = await res.text();

    if (!res.ok) {
      console.error('[paychangu verify] failed:', res.status, text);
      throw new Error(`PayChangu verify failed (${res.status}): ${text}`);
    }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('PayChangu returned non-JSON verification');
    }

    const d = body?.data;
    if (!d) throw new Error('PayChangu returned no verification data');

    return {
      status: d.status as 'success' | 'failed' | 'pending',
      amountMWK: Number(d.amount),
      currency: d.currency,
      txRef: d.tx_ref,
      channel: d.authorization?.channel ?? 'unknown',
      raw: body,
    };
  },
};