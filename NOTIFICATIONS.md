# Vada Meet reminders: activation guide

The application supports optional reminders 24 hours and 30 minutes before a reserved event. Sending is disabled until the providers, secrets and final activation switch are configured. No live email or SMS delivery has been tested yet.

## Loops

1. Create your account at https://loops.so and verify a sending domain using the DNS records Loops supplies. A subdomain of an existing domain you control can be used without buying another domain. The shared chatgpt.site address cannot be verified as your sending domain.
2. Create and publish a transactional template with these exact data variables: `eventName`, `eventTime`, `reminderLabel`, `joinUrl`, `preferencesUrl`.
3. Suggested subject: `Your Vada Meet event is {{reminderLabel}}`.
4. Suggested body: `Your place at {{eventName}} is reserved. Start time: {{eventTime}}. Sign in to Vada Meet and join your event using the button below. Check-in opens 30 minutes before the start. Your host will start the rounds.` Add a **Join your event** button linked to `joinUrl`, and a **Manage reminders** link to `preferencesUrl`. Insert these using Loops' data-variable editor.
5. Store the API key and published template ID in Supabase → Edge Functions → Secrets as `LOOPS_API_KEY` and `LOOPS_REMINDER_TEMPLATE_ID`. Never commit secrets or paste them into chat.

Only transactional email is used; recipients are not added to a marketing audience. Loops acceptance is recorded, not claimed as confirmed inbox delivery.

## Twilio

1. Create an account at https://www.twilio.com. Complete Twilio's identity/account requirements yourself. Trial sending may be restricted to verified recipient numbers.
2. Set up an SMS-capable sender and a Messaging Service, including any registration required for the sender and destination countries. Use a sender that supports replies and enable Advanced Opt-Out. Set sensible geographic permissions and spending alerts.
3. Create a Verify Service for member phone verification. Verification sends are separately billable; the app limits each verified account to one request per minute and three per day. Enable Twilio Fraud Guard and service-side limits before launch too.
4. Store `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_VERIFY_SERVICE_SID` in Supabase Edge Function Secrets.
5. Configure the Messaging Service incoming-message webhook (POST) as `https://zccppmeltuvhdlmhqrnc.supabase.co/functions/v1/vada-twilio`. The app supplies this endpoint for delivery-status callbacks as well. Twilio signatures are validated. STOP disables local SMS preferences; Twilio also suppresses further messages. START does not silently re-enable Vada consent: the member must opt in again in the app.

SMS includes the event time, signed-in join link and STOP instructions, and may use multiple charged segments. No phone numbers are exposed in profiles or organiser charts.

## Activate and rehearse

Keep `VADA_NOTIFICATIONS_ENABLED` absent or `false` while configuring. Make the website accessible to your intended testers first. After configuring providers and templates, set it to `true` in Supabase Secrets. Check the host dashboard says connected, then opt in using **Reminders** in the footer. Verify your own phone and explicitly save SMS consent.

Reserve a test event more than 30 minutes ahead, keep its start time, and check the 30-minute reminder. Rehearse the 24-hour reminder with a booking made more than 24 hours ahead. A booking made after a reminder's scheduled time does not receive that reminder retroactively. Test opt-out, cancellation, join links after signing out, and provider error handling before inviting the public. Do not use real recipients without their consent.

The scheduler runs every minute, claims at most 20 jobs per tick and prevents duplicate claims. It only sends for published events, existing reservations and current channel consent. Reminders expire after a 15-minute grace period. Provider errors appear in `notification_jobs` and the host's recent-send summary. Uncertain/time-out sends are not automatically retried, avoiding duplicate SMS; inspect provider logs before any manual resend. Loops idempotency keys add a second duplicate guard. Delivery can never be guaranteed.

Supabase signup/password-reset emails are separate from these event reminders. Their SMTP configuration remains a separate launch step.

References: https://loops.so/docs/api-reference/send-transactional-email · https://www.twilio.com/docs/messaging/api/message-resource · https://www.twilio.com/docs/verify/api · https://www.twilio.com/docs/usage/security
