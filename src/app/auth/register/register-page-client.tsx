"use client";

import Link from "next/link";
import { Button } from "@/design-systems/shadcn/components/button";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import RegisterForm from "@/features/auth/components/register-form";
import { GoogleIcon, GithubIcon } from "@/design-systems/shadcn/components/icons";
import { authClientProvider } from "@/auth/client-provider";

export function RegisterPageClient() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="flex flex-col items-center w-full max-w-md gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <img src="/fixpro-logo.webp" alt="Fix Pro AI" className="size-6 rounded-md" />
          Fix Pro AI
        </a>
        <Card className="w-full">
          <CardContent className="flex flex-col gap-4 pt-6">
            <RegisterForm />
            <div className="flex items-center my-2">
              <div className="flex-1 h-px bg-muted-foreground/30" />
              <span className="mx-3 text-muted-foreground text-xs font-medium">
                OR
              </span>
              <div className="flex-1 h-px bg-muted-foreground/30" />
            </div>
            <div className="flex flex-row gap-2 w-full">
              <Button
                variant="outline"
                className="w-1/2 flex items-center justify-center"
                type="button"
                onClick={() => authClientProvider.signInWithGoogle()}
              >
                <GoogleIcon className="mr-2" />
                Google
              </Button>
              <Button
                variant="outline"
                className="w-1/2 flex items-center justify-center"
                type="button"
                onClick={() => authClientProvider.signInWithGithub()}
              >
                <GithubIcon className="mr-2" />
                GitHub
              </Button>
            </div>
            <div className="text-center text-sm mt-4">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-primary underline hover:no-underline font-medium"
              >
                Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
