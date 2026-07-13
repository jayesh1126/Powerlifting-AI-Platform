import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/http";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 forces the browser to follow the redirect with GET after our POST.
  // publicOrigin, not request.url — the latter is the container bind
  // address behind the proxy.
  return NextResponse.redirect(new URL("/", publicOrigin(request)), {
    status: 303,
  });
}
