import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 forces the browser to follow the redirect with GET after our POST.
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
