import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { authServerProvider } from "@/auth/server-provider";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await authServerProvider.getSession({
          headers: await headers(),
        });
        if (!session?.user) {
          throw new Error("UNAUTHORIZED_ACCESS_DENIED");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      // onUploadCompleted intentionally omitted: the DB row is written by
      // uploadEstimatePdfAction after the client upload() resolves, so we do
      // not need a Vercel-side webhook. Including it would require a
      // publicly reachable callbackUrl, which breaks local dev.
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
