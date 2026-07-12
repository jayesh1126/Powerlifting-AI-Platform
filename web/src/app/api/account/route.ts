import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteUserAccount } from "@/lib/db";

/** Permanently deletes the authenticated user's account. */
export async function DELETE() {
  const { supabase, claims } = await getAuth();
  if (!claims) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const { error } = await deleteUserAccount(admin, claims.sub);
  if (error) {
    return NextResponse.json(
      { success: false, message: "Failed to delete account" },
      { status: 500 }
    );
  }

  // Clear the local session cookies.
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
