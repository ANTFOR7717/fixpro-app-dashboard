"use server";

import { authServerProvider } from "@/auth/server-provider";
import { AuthError } from "@/auth/types";
import { ActionResult } from "@/lib/schemas";
import { registerSchema, type RegisterSchema } from "@/features/auth/schemas/register-schema";

export async function registerUser(
  formData: RegisterSchema,
): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(formData);

  if (!parsed.success) {
    return {
      success: null,
      error: { reason: parsed.error.issues[0]?.message || "Invalid input" },
    };
  }

  const { email, password, name } = parsed.data;

  try {
    console.log(">>>> ATTEMPTING SIGNUP FOR:", email);
    const { user } = await authServerProvider.signUpEmail(email, password, name);
    console.log(">>>> SIGNUP SUCCESSFUL FOR:", user.email);

    console.log(">>>> FORCING VERIFICATION EMAIL...");
    try {
      const emailResult = await authServerProvider.sendVerificationEmail(user.email);
      console.log(">>>> VERIFICATION EMAIL SUCCESS RESPONSE:", emailResult);
    } catch (emailError: any) {
      console.error(">>>> CRITICAL: VERIFICATION EMAIL FAILED:", emailError);
      throw new Error(`Account created, but verification email failed: ${emailError.message || "Unknown Resend error"}`);
    }
    
    console.log(">>>> VERIFICATION EMAIL REQUESTED AND CONFIRMED BY RESEND.");

    return {
      success: {
        reason:
          "Registration successful! Check your email to confirm your account.",
      },
      error: null,
      data: { user: { id: user.id, email: user.email } },
    };
  } catch (error: any) {
    console.error(">>>> REGISTRATION FAILED ERROR:", error);
    if (
      error?.status === "UNPROCESSABLE_ENTITY" ||
      (error instanceof AuthError && error.status === "UNPROCESSABLE_ENTITY")
    ) {
      return { error: { reason: "User already exists." }, success: null };
    }
    return {
      error: {
        reason: error instanceof AuthError ? error.body.message || "Something went wrong." : error?.message || "Something went wrong."
      },
      success: null
    };
  }
}
