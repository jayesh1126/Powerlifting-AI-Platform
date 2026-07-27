import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuth } from "@/lib/supabase/server";
import { getMonthlyAiActions, getProgram } from "@/lib/db";
import { AI_ACTIONS_MONTHLY_LIMIT } from "@/lib/quota";
import { ProgramEditor } from "@/components/programs/program-editor";

export const metadata = { title: "Program — PowerliftingAI" };

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { supabase, claims } = await getAuth();
  if (!claims) redirect("/");

  const { programId } = await params;
  const [{ data }, { count: aiUsed }] = await Promise.all([
    getProgram(supabase, claims.sub, programId),
    getMonthlyAiActions(supabase, claims.sub),
  ]);
  if (!data) redirect("/programs");

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 space-y-4">
        <div className="px-1">
          <Link
            href="/programs"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All programs
          </Link>
        </div>

        <ProgramEditor
          programId={data.id}
          initialTitle={data.title ?? ""}
          initialProgram={data.program}
          initialAiUsed={aiUsed}
          aiLimit={AI_ACTIONS_MONTHLY_LIMIT}
        />
      </div>
    </div>
  );
}
