import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getAuth } from "@/lib/supabase/server";
import { getPrograms, getMonthlyAiActions } from "@/lib/db";
import { AI_ACTIONS_MONTHLY_LIMIT } from "@/lib/quota";
import { NewProgramButton } from "@/components/programs/new-program-button";
import { ProgramList } from "@/components/programs/program-list";
import { pillBase, pillSizes, pillVariants } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

export const metadata = { title: "Programs — PowerliftingAI" };

export default async function ProgramsPage() {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  const [{ data: programs }, { count: aiActions }] = await Promise.all([
    getPrograms(supabase, claims.sub),
    getMonthlyAiActions(supabase, claims.sub),
  ]);
  const quotaSpent = aiActions >= AI_ACTIONS_MONTHLY_LIMIT;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="font-display text-3xl font-bold uppercase">
              Programs
            </h1>
            <p
              className={cn(
                "text-xs tabular-nums mt-1",
                quotaSpent ? "text-red-600" : "text-gray-400",
              )}
            >
              {aiActions} / {AI_ACTIONS_MONTHLY_LIMIT} AI actions used this month
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NewProgramButton />
            <Link
              href="/programs/new"
              className={cn(pillBase, pillVariants.dark, pillSizes.sm)}
            >
              <Sparkles className="h-4 w-4" />
              Import from text
            </Link>
          </div>
        </div>

        {programs && programs.length > 0 ? (
          <ProgramList programs={programs} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
            <p className="font-medium text-gray-900">No programs yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              Start a program and build it week by week — each one is a grid
              of days and exercises you can edit any time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
