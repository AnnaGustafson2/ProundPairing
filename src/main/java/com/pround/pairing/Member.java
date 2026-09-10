package com.pround.pairing;

/**
 * Mirrors a row in the `members` table.
 * Plain data holder - Gson serializes this straight to JSON for API responses.
 */
public class Member {
    public int id;
    public String name;
    public String experienceLevel;
    public int yearsOnTeam;

    public Member() {
        // Gson needs a no-arg constructor
    }
}