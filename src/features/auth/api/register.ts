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
    const { user } = await authServerProvider.signUpEmail(email, password, name);

    return {
      success: {
        reason:
          "Registration successful! Check your email to confirm your account.",
      },
      error: null,
      data: { user: { id: user.id, email: user.email } },
    };
  } catch (error: any) {
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
