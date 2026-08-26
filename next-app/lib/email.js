import { Resend } from "resend";

export async function sendCoachRegistrationNotice({ email, name, coachCode }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Cauayan City athlete system registration received",
    text: `Hello ${name},\n\nYour coach registration was received. Your coach ID is ${coachCode}. An administrator must approve your account before you can sign in.\n\nCauayan City Athlete Performance Monitoring System`,
  });
  if (error) throw error;
  return true;
}
