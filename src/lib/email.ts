import { Resend } from "resend";

export const sendEmail = async (payload: {
  to: string;
  subject: string;
  text: string;
}) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(">>>> CRITICAL ERROR: RESEND_API_KEY IS MISSING FROM ENVIRONMENT");
    throw new Error("Email service is not configured. Missing RESEND_API_KEY.");
  }

  const resend = new Resend(apiKey);

  console.log(">>>> SERVER-SIDE EMAIL SEND INITIATED TO:", payload.to);

  const { data, error } = await resend.emails.send({
    from: "Fix Pro AI <noreply@goodshepherdinsights.com>",
    ...payload,
  });

  if (error) {
    console.error(">>>> RESEND ERROR RESPONSE:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log(">>>> RESEND SUCCESS RESPONSE:", data);

  return data;
};
