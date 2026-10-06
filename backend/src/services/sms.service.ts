import { env, isProduction, isTest } from '../config/env';
import { ServiceUnavailableError } from '../utils/errors';

export const smsEnabled = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);

/** True when codes are not really sent, so the API may hand them to the client for testing. */
export const exposeDevCodes = !smsEnabled && !isProduction;

/** "+995555123456" → "+995 ••• ••• 456" */
export function maskPhone(phone: string) {
  return `${phone.slice(0, 4)} ••• ••• ${phone.slice(-3)}`;
}

/**
 * Sends a text message through Twilio's REST API (no SDK needed). Without Twilio
 * credentials the message is only logged — fine for development, refused in production.
 */
export async function sendSms(to: string, body: string) {
  if (!smsEnabled) {
    if (isProduction) throw new ServiceUnavailableError('SMS delivery is not configured', 'SMS_NOT_CONFIGURED');
    if (!isTest) console.info(`[sms:dev] to ${to}: ${body}`);
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER!, Body: body }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[sms] Twilio request failed:', err);
    throw new ServiceUnavailableError('Could not send the SMS, try again later', 'SMS_SEND_FAILED');
  }
  if (!res.ok) {
    console.error(`[sms] Twilio responded ${res.status}:`, await res.text().catch(() => ''));
    throw new ServiceUnavailableError('Could not send the SMS, check the phone number and try again', 'SMS_SEND_FAILED');
  }
}
