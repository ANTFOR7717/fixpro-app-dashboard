import { Resend } from "resend";

export const sendEmail = async (payload: {
  to: string;
  subject: string;
  text: string;
}) => {
  const resend = new Resend(process.env.RESEND_API_KEY);

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
