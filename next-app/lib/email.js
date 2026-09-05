import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_FROM } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn("Gmail credentials not configured. Email sending disabled.");
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  return transporter;
}

export async function sendCoachRegistrationNotice({ email, name, coachCode }) {
  const transporter = getTransporter();
  if (!transporter) return false;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to: email,
      subject: "Cauayan City athlete system registration received",
      text: `Hello ${name},\n\nYour coach registration was received. Your coach ID is ${coachCode}. An administrator must approve your account before you can sign in.\n\nCauayan City Athlete Performance Monitoring System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #041f18;">Cauayan City Athlete Performance Monitoring System</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your coach registration was received.</p>
          <p><strong>Coach ID:</strong> ${coachCode}</p>
          <p>An administrator must approve your account before you can sign in.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">Cauayan City Athlete Performance Monitoring System</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send registration notice:", error);
    return false;
  }
}

export async function sendCoachApprovalEmail({ email, name, coachCode }) {
  const transporter = getTransporter();
  if (!transporter) return false;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to: email,
      subject: "Your Cauayan City athlete system account has been approved",
      text: `Hello ${name},\n\nYour coach account has been approved!\n\nCoach ID: ${coachCode}\n\nYou can now sign in at the system URL using the username and password you registered with.\n\nCauayan City Athlete Performance Monitoring System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #041f18;">Cauayan City Athlete Performance Monitoring System</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your coach account has been <strong style="color: #2dd4a8;">approved</strong>!</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Coach ID:</strong> ${coachCode}</p>
          </div>
          <p>You can now sign in at the system URL using the <strong>username and password</strong> you registered with.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">Cauayan City Athlete Performance Monitoring System</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send approval email:", error);
    return false;
  }
}

export async function sendCoachRejectionEmail({ email, name, coachCode, reason }) {
  const transporter = getTransporter();
  if (!transporter) return false;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to: email,
      subject: "Your Cauayan City athlete system registration was not approved",
      text: `Hello ${name},\n\nYour coach registration (${coachCode}) was not approved.\n\nReason: ${reason || "Not specified"}\n\nCauayan City Athlete Performance Monitoring System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #041f18;">Cauayan City Athlete Performance Monitoring System</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your coach registration (<strong>${coachCode}</strong>) was not approved.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">Cauayan City Athlete Performance Monitoring System</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send rejection email:", error);
    return false;
  }
}

export async function sendPasswordResetLink({ email, name, resetUrl }) {
  const transporter = getTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to: email,
      subject: "Reset your Cauayan City athlete system password",
      text: `Hello ${name},\n\nSomeone requested to reset the password for your Cauayan City athlete account.\n\nOpen the link below to choose a new password. It expires in 30 minutes.\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.\n\nCauayan City Athlete Performance Monitoring System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #041f18;">Cauayan City Athlete Performance Monitoring System</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Someone requested to reset the password for your account. If this was you, click the button below. The link expires in 30 minutes.</p>
          <p><a href="${resetUrl}" style="display:inline-block; background:#2dd4a8; color:#041f18; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">Choose a new password</a></p>
          <p style="color:#666; font-size:13px;">If the button does not work, copy this link into your browser:<br/>${resetUrl}</p>
          <p style="color:#666; font-size:12px;">If you did not request this, you can safely ignore this email.</p>
          <hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;" />
          <p style="color:#666; font-size:12px;">Cauayan City Athlete Performance Monitoring System</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send password reset link:", error);
    return false;
  }
}

export async function sendNotificationEmail({ email, name, subject, message }) {
  const transporter = getTransporter();
  if (!transporter || !email) return false;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to: email,
      subject: subject,
      text: message,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #041f18;">Cauayan City Athlete Performance Monitoring System</h2>
          <p>Hello<strong>${name ? ` ${name}` : ""}</strong>,</p>
          <p style="white-space: pre-line;">${String(message || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">Cauayan City Athlete Performance Monitoring System</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send notification email:", error);
    return false;
  }
}

export async function sendEventApplicationDecisionEmail({ email, name, eventPlanName, decision, reason }) {
  const transporter = getTransporter();
  if (!transporter) return false;
  const ok = decision === "approved";
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to: email,
      subject: `Your application to "${eventPlanName}" was ${decision}`,
      text: `Hello ${name},\n\nYour application to the event plan "${eventPlanName}" was ${decision} by an administrator.${reason ? `\n\nReason: ${reason}` : ""}\n\nCauayan City Athlete Performance Monitoring System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #041f18;">Cauayan City Athlete Performance Monitoring System</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your application to the event plan <strong>"${eventPlanName}"</strong> was ${ok ? '<strong style="color: #2dd4a8;">approved</strong>' : '<strong style="color: #f56565;">not approved</strong>'} by an administrator.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          ${ok ? "<p>You can now add your athletes to this event plan.</p>" : ""}
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">Cauayan City Athlete Performance Monitoring System</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send event application decision email:", error);
    return false;
  }
}
