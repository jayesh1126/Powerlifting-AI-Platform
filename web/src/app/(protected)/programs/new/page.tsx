import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuth } from "@/lib/supabase/server";
import { getMonthlyAiActions } from "@/lib/db";
import { AI_ACTIONS_MONTHLY_LIMIT } from "@/lib/quota";
import { ProgramImport } from "@/components/programs/program-import";

export const metadata = { title: "Import a program — PowerliftingAI" };

export default async function NewProgramPage() {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  const { count: aiUsed } = await getMonthlyAiActions(supabase, claims.sub);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10 space-y-4">
        <div className="px-1">
          <Link
            href="/programs"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All programs
          </Link>
          <h1 className="font-display text-3xl font-bold uppercase mt-2">
            Import a program
          </h1>
        </div>

        <ProgramImport aiUsed={aiUsed} aiLimit={AI_ACTIONS_MONTHLY_LIMIT} />
      </div>
    </div>
  );
}
