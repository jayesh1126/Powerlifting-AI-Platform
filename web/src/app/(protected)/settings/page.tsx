import { redirect } from "next/navigation";
import Image from "next/image";
import { getAuth } from "@/lib/supabase/server";
import { getMonthlyRequestCount, getMonthlyAiActions } from "@/lib/db";
import { FREE_MONTHLY_LIMIT, AI_ACTIONS_MONTHLY_LIMIT } from "@/lib/quota";
import { DeleteAccountButton } from "@/components/delete-account-button";

export const metadata = { title: "Settings — PowerliftingAI" };

/** One labelled usage bar. Server-rendered; no state. */
function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-2">
      <span className="text-2xl font-bold text-gray-900 tabular-nums">
        {used}
        <span className="text-sm font-normal text-gray-400">
          {" "}
          / {limit} {label}
        </span>
      </span>
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={
            pct >= 100
              ? "h-full rounded-full bg-red-500"
              : "h-full rounded-full bg-black"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct >= 100 && (
        <p className="text-xs text-red-600">
          You&apos;ve reached this month&apos;s limit.
        </p>
      )}
    </div>
  );
}

export default async function SettingsPage() {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  // Both quotas share the request_counts row, so one round-trip each, parallel.
  const [{ count }, { count: aiActions }] = await Promise.all([
    getMonthlyRequestCount(supabase, claims.sub),
    getMonthlyAiActions(supabase, claims.sub),
  ]);

  const email = (claims.email as string) ?? "unknown";
  const meta = claims.user_metadata as
    | { avatar_url?: string; full_name?: string }
    | undefined;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 space-y-5">
        <h1 className="font-display text-3xl font-bold uppercase px-1">
          Settings
        </h1>

        {/* Profile */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="font-mono text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-4">
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

        {/* Usage — both free-tier pools */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-mono text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Monthly usage
            </h2>
            <span className="text-xs text-gray-400">
              resets on the 1st of each month
            </span>
          </div>
          <div className="space-y-5">
            <UsageMeter label="chat requests" used={count} limit={FREE_MONTHLY_LIMIT} />
            <UsageMeter
              label="program AI actions"
              used={aiActions}
              limit={AI_ACTIONS_MONTHLY_LIMIT}
            />
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-red-200 bg-white p-5 sm:p-6">
          <h2 className="font-mono text-[11px] font-semibold text-red-600 uppercase tracking-wide mb-4">
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
