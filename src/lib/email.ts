import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (payload: {
  to: string;
  subject: string;
  text: string;
}) => {
  try {
    const response = await resend.emails.send({
      from: "",
      ...payload,
    });

    console.log("Email sent successfully:", response);

    if (response?.data) return true;
    return false;
  } catch (error: any) {
    console.error("Error sending email:", error);
    return false;
  }
};
