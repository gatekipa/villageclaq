-- ============================================================================
-- Migration 00057: Fix profiles SELECT RLS — allow co-members to read profiles
-- ============================================================================
-- ROOT CAUSE: The profiles SELECT policy was tightened (in the Supabase
-- dashboard, not via migration) from USING(true) to USING(auth.uid() = id).
-- This breaks the members list, which JOINs profiles to get full_name,
-- avatar_url, and phone for all group members. With self-only RLS, the JOIN
-- returns NULL for every member except the current user.
--
-- Also breaks: member search, CSV/PDF exports, notification pipelines
-- that read profiles.phone for other users, and any admin view that
-- shows member details.
--
-- FIX: Replace the self-only policy with one that allows reading profiles
-- of users who share at least one group with the current user. Uses the
-- get_user_group_ids() SECURITY DEFINER helper to avoid RLS recursion.
--
-- Run manually in Supabase SQL Editor.
-- ============================================================================

-- Drop the existing restrictive policy (whatever its current USING clause is)
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

-- Also drop any other SELECT policies that may have been created in the dashboard
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

-- Create the new policy: self + co-members
-- This allows reading profiles of people who share at least one group with you.
-- Safe because:
--   1. An admin explicitly added these users to the group (they're co-members)
--   2. The data exposed (name, phone, avatar) is needed for the members list
--   3. Users outside any shared group remain invisible
CREATE POLICY "Profiles readable by self and co-members"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    -- Can always read own profile
    id = auth.uid()
    OR
    -- Can read profiles of users who share a group with you
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = profiles.id
        AND m.group_id IN (SELECT unnest(get_user_group_ids()))
    )
  );
