package com.pround.pairing;

import java.util.ArrayList;
import java.util.List;

/**
 * Takes a session's attendees + constraints and produces groups of 5.
 *
 * STUB: currently just returns a placeholder single group containing
 * everyone, so the rest of the app (API + frontend) has something real
 * to display while the actual algorithm gets built out.
 */
public class GroupingEngine {

    public static List<Group> generateGroups(List<Member> attendees, List<Constraint> constraints) {
        List<Group> groups = new ArrayList<>();

        Group placeholder = new Group();
        placeholder.groupNumber = 1;
        placeholder.members = attendees;
        groups.add(placeholder);

        return groups;
    }

    public static class Group {
        public int groupNumber;
        public List<Member> members;
    }

    public static class Constraint {
        public String type; // "PAIR" or "AVOID"
        public int memberAId;
        public int memberBId;
    }
}