#!/usr/bin/env node
/**
 * Sends one SMS through Africa's Talking with the configured credentials and prints
 * exactly what came back.
 *
 * This exists because a 401 from inside the API tells you almost nothing: it could be
 * a missing key, a key from the wrong app, a username that is not "sandbox", or a
 * value mangled on its way into the environment. This reports each of those separately
 * without ever printing the key itself.
 *
 * Usage: npm run check:sms -w @mzazicare/api -- +254711111111
 */

const recipient = process.argv[2];

if (!recipient) {
  console.error('Usage: npm run check:sms -w @mzazicare/api -- +254712345678');
  process.exit(1);
}

const username = process.env.AT_USERNAME;
const apiKey = process.env.AT_API_KEY;

const describe = (label, value) => {
  if (value === undefined) return `${label}: NOT SET`;
  if (value === '') return `${label}: empty string`;
  return `${label}: set, ${value.length} characters, "${value.slice(0, 4)}…${value.slice(-4)}"`;
};

console.log('\nConfiguration');
console.log(`  AT_USERNAME: ${username === undefined ? 'NOT SET' : `"${username}"`}`);
console.log(`  ${describe('AT_API_KEY ', apiKey)}`);

if (!username || !apiKey) {
  console.error('\nOne of them is missing from apps/api/.env. Fill it in and run again.\n');
  process.exit(1);
}

if (username.trim() !== username || apiKey.trim() !== apiKey) {
  console.error('\nA value has leading or trailing whitespace, which the API will reject.\n');
  process.exit(1);
}

const sandbox = username === 'sandbox';
const baseUrl = sandbox
  ? 'https://api.sandbox.africastalking.com'
  : 'https://api.africastalking.com';

console.log(`  Endpoint:    ${baseUrl} (${sandbox ? 'sandbox' : 'live'})`);
console.log(`  Recipient:   ${recipient}\n`);

if (!sandbox) {
  console.log('Note: the username is not "sandbox", so this will attempt a live, billable send.\n');
}

const body = new URLSearchParams({
  username,
  to: recipient,
  message: 'MzaziCare credentials check.',
});
const senderId = process.env.AT_SENDER_ID;
if (senderId) body.set('from', senderId);

const response = await fetch(`${baseUrl}/version1/messaging`, {
  method: 'POST',
  headers: {
    apiKey,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  },
  body: body.toString(),
});

const text = await response.text();
console.log(`HTTP ${response.status}`);
console.log(text);

if (response.status === 401) {
  console.error(
    [
      '',
      'The key was rejected. The usual cause is a key generated on the main dashboard',
      'rather than inside the sandbox app: the two look identical and are not',
      'interchangeable. Open account.africastalking.com, click "Go to sandbox app",',
      'then Settings, API Key, and generate one from there.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

try {
  const recipientResult = JSON.parse(text)?.SMSMessageData?.Recipients?.[0];
  if (recipientResult?.statusCode >= 100 && recipientResult?.statusCode <= 102) {
    console.log('\nAccepted. Check the simulator tab for the message.\n');
  } else if (recipientResult) {
    console.log(`\nRejected: ${recipientResult.status} (${recipientResult.statusCode})\n`);
  }
} catch {
  // The body was already printed; nothing more to add.
}
