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

export async function sendCoachApprovalEmail({ email, name, coachCode, temporaryPassword }) {
  const transporter = getTransporter();
  if (!transporter) return false;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to: email,
      subject: "Your Cauayan City athlete system account has been approved",
      text: `Hello ${name},\n\nYour coach account has been approved!\n\nCoach ID: ${coachCode}\nTemporary Password: ${temporaryPassword}\n\nPlease sign in at the system URL and change your password immediately.\n\nCauayan City Athlete Performance Monitoring System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #041f18;">Cauayan City Athlete Performance Monitoring System</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your coach account has been <strong style="color: #2dd4a8;">approved</strong>!</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Coach ID:</strong> ${coachCode}</p>
            <p><strong>Temporary Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px;">${temporaryPassword}</code></p>
          </div>
          <p style="color: #f87171;"><strong>Important:</strong> Please sign in at the system URL and change your password immediately.</p>
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