"use server";

import { authServerProvider } from "@/auth/server-provider";
import { AuthError } from "@/auth/types";
import { ActionResult } from "@/lib/schemas";

export async function loginUser({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<ActionResult<{ user: { id: string; email: string } }>> {
  try {
    await authServerProvider.signInEmail(email, password);

    return {
      success: { reason: "Login successful" },
      error: null,
      data: undefined,
    };
  } catch (err: any) {
    if (err instanceof AuthError) {
      return {
        error: { reason: err.body.message || "Something went wrong." },
        success: null
      };
    }
    return {
      error: { reason: err?.message || "Something went wrong." },
      success: null
    };
  }
}
