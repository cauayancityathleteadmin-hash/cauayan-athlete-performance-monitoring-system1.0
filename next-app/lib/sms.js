const SEMAPHORE_ENDPOINT = "https://api.semaphore.co/api/v4/messages";

export async function sendSms({ to, message }) {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) {
    console.warn("SEMAPHORE_API_KEY not configured. SMS sending disabled.");
    return false;
  }
  if (!to || !message) return false;
  try {
    const body = new URLSearchParams({
      apikey: apiKey,
      number: String(to).trim(),
      message: String(message).slice(0, 1000),
    });
    const senderName = String(process.env.SEMAPHORE_SENDER || "").trim();
    if (senderName) body.set("sendername", senderName);
    const response = await fetch(SEMAPHORE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) {
      console.error("Semaphore SMS error:", response.status, await response.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("SMS send failed:", error);
    return false;
  }
}