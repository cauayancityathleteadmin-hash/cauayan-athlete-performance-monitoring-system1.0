import { sendSms } from "./sms";
import { sendNotificationEmail } from "./email";

export async function notifyAthlete({ athlete, subject, message }) {
  const results = { sms: false, email: false };
  if (!athlete) return results;
  const name = athlete.fullName || (athlete.firstName ? `${athlete.firstName} ${athlete.lastName || ""}`.trim() : "");
  if (athlete.contactNumber) {
    results.sms = await sendSms({ to: athlete.contactNumber, message });
  }
  if (athlete.email) {
    results.email = await sendNotificationEmail({ email: athlete.email, name, subject, message });
  }
  return results;
}

export async function notifyCoach({ coach, subject, message }) {
  const results = { sms: false, email: false };
  if (!coach) return results;
  const name = `${coach.firstName || ""} ${coach.lastName || ""}`.trim();
  if (coach.notifySms && coach.contactNumber) {
    results.sms = await sendSms({ to: coach.contactNumber, message });
  }
  if (coach.notifyEmail) {
    results.email = await sendNotificationEmail({ email: coach.email, name, subject, message });
  }
  return results;
}