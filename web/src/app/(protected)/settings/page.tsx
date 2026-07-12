import { redirect } from "next/navigation";
import { getAuth } from "@/lib/supabase/server";
import { getMonthlyRequestCount } from "@/lib/db";
import { FREE_MONTHLY_LIMIT } from "@/lib/quota";
import { DeleteAccountButton } from "@/components/delete-account-button";

export const metadata = { title: "Settings — PowerliftingAI" };

export default async function SettingsPage() {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  const { count } = await getMonthlyRequestCount(supabase, claims.sub);
  const email = (claims.email as string) ?? "unknown";

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Account
        </h2>
        <p className="text-sm text-gray-700">Signed in as {email}</p>
        <p className="text-sm text-gray-700">
          Usage this month: {count}/{FREE_MONTHLY_LIMIT} requests
        </p>
      </section>

      <section className="space-y-3 border-t border-gray-200 pt-6">
        <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide">
          Danger zone
        </h2>
        <p className="text-sm text-gray-600">
          Deleting your account removes all your chats and data permanently.
        </p>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
