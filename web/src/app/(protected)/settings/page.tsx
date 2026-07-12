import { redirect } from "next/navigation";
import Image from "next/image";
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
  const meta = claims.user_metadata as
    | { avatar_url?: string; full_name?: string }
    | undefined;

  const usagePct = Math.min(100, Math.round((count / FREE_MONTHLY_LIMIT) * 100));

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 space-y-5">
        <h1 className="text-2xl font-bold px-1">Settings</h1>

        {/* Profile */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Profile
          </h2>
          <div className="flex items-center gap-4">
            {meta?.avatar_url ? (
              <Image
                src={meta.avatar_url}
                alt="Your avatar"
                width={48}
                height={48}
                className="h-12 w-12 rounded-full border border-gray-200"
                unoptimized
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-semibold">
                {email.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              {meta?.full_name && (
                <p className="font-medium text-gray-900 truncate">
                  {meta.full_name}
                </p>
              )}
              <p className="text-sm text-gray-500 truncate">{email}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Signed in with Google
              </p>
            </div>
          </div>
        </section>

        {/* Usage */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Monthly usage
          </h2>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-gray-900 tabular-nums">
                {count}
                <span className="text-sm font-normal text-gray-400">
                  {" "}
                  / {FREE_MONTHLY_LIMIT} requests
                </span>
              </span>
              <span className="text-xs text-gray-400">
                resets on the 1st of each month
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={
                  usagePct >= 100
                    ? "h-full rounded-full bg-red-500"
                    : "h-full rounded-full bg-black"
                }
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {usagePct >= 100 && (
              <p className="text-xs text-red-600">
                You&apos;ve reached this month&apos;s free limit.
              </p>
            )}
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-red-200 bg-white p-5 sm:p-6">
          <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-4">
            Danger zone
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-600 max-w-sm">
              Permanently delete your account, including all chats and data.
              This cannot be undone.
            </p>
            <DeleteAccountButton />
          </div>
        </section>
      </div>
    </div>
  );
}
