import { buildLlmsTxt } from "@/lib/llms";

// A directory whose name contains a dot is an ordinary App Router segment, so this file serves `/llms.txt` with no rewrite and no file in `public/`. Generating it per request is the point: the block, theme and source names come from the modules the deployment is running, not from a copy someone remembered to update.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  // Behind a proxy `request.url` carries the internal address the app was reached at, not the one the agent typed, and every link in the document is built from whatever this returns. The forwarded pair is what a caller actually saw; both headers are list-valued when more than one hop appended to them, and the first entry is the client-facing one.
  const url = new URL(request.url);
  const forwarded = (name: string) => request.headers.get(name)?.split(",")[0]?.trim() || null;
  const host = forwarded("x-forwarded-host") ?? url.host;
  const protocol = forwarded("x-forwarded-proto") ?? url.protocol.replace(":", "");

  return new Response(buildLlmsTxt(`${protocol}://${host}`), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
