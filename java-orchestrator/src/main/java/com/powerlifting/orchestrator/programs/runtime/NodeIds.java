package com.powerlifting.orchestrator.programs.runtime;

import com.powerlifting.orchestrator.programs.model.ExercisePrescription;
import com.powerlifting.orchestrator.programs.model.Program;
import com.powerlifting.orchestrator.programs.model.ProgramDay;
import com.powerlifting.orchestrator.programs.model.ProgramWeek;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Assigns stable node ids to a program.
 *
 * <p>Runs once, immediately after the normalizer's output validates. Ids are
 * positional at birth ("w1", "w1d2", "w1d2e3") but <em>stable</em> afterwards:
 * the client never renumbers, so a suggestion targeting "w1d2e3" stays valid
 * however the program is later edited around it. Suggestions target ids by
 * value, which is the whole reason ids exist instead of positions.
 */
public final class NodeIds {

    private NodeIds() {
    }

    /** Returns a copy of {@code program} with every node's id assigned. */
    public static Program assign(Program program) {
        List<ProgramWeek> weeks = new ArrayList<>(program.weeks().size());
        int wi = 1;
        for (ProgramWeek week : program.weeks()) {
            String weekId = "w" + wi;
            weeks.add(week.withId(weekId).withDays(assignDays(week.days(), weekId)));
            wi++;
        }
        return program.withWeeks(weeks);
    }

    private static List<ProgramDay> assignDays(List<ProgramDay> days, String weekId) {
        List<ProgramDay> out = new ArrayList<>(days.size());
        int di = 1;
        for (ProgramDay day : days) {
            String dayId = weekId + "d" + di;
            out.add(day.withId(dayId).withExercises(assignExercises(day.exercises(), dayId)));
            di++;
        }
        return out;
    }

    private static List<ExercisePrescription> assignExercises(
            List<ExercisePrescription> exercises, String dayId) {
        List<ExercisePrescription> out = new ArrayList<>(exercises.size());
        int ei = 1;
        for (ExercisePrescription exercise : exercises) {
            out.add(exercise.withId(dayId + "e" + ei));
            ei++;
        }
        return out;
    }

    /**
     * A fresh id for a node the AI adds (an {@code add_exercise} /
     * {@code add_day} payload). The "n" prefix distinguishes AI-added nodes from
     * the positional ids above and the client's own "u"-prefixed manual ids;
     * uniqueness within one program is all that matters.
     */
    public static String freshId() {
        return "n" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }
}
