-- ============================================================
-- Phase 3: Events & Operations Tables
-- Events, Attendance, Hosting Roster, Meeting Minutes
-- ============================================================

-- ==================== ENUM TYPES ====================

CREATE TYPE event_type AS ENUM ('meeting', 'social', 'fundraiser', 'agm', 'emergency', 'other');
CREATE TYPE recurrence_rule AS ENUM ('weekly', 'biweekly', 'monthly', 'custom');
CREATE TYPE rsvp_response AS ENUM ('yes', 'no', 'maybe');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'excused', 'late');
CREATE TYPE checkin_method AS ENUM ('manual', 'qr', 'pin');
CREATE TYPE event_status AS ENUM ('upcoming', 'in_progress', 'completed', 'cancelled');
CREATE TYPE rotation_type AS ENUM ('sequential', 'random', 'manual');
CREATE TYPE hosting_status AS ENUM ('upcoming', 'completed', 'missed', 'swapped', 'exempted');
CREATE TYPE swap_request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE minutes_status AS ENUM ('draft', 'published');

-- ==================== EVENTS ====================

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_fr TEXT,
  description TEXT,
  description_fr TEXT,
  location TEXT,
  location_map_url TEXT,
  event_type event_type NOT NULL DEFAULT 'meeting',
  status event_status NOT NULL DEFAULT 'upcoming',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule recurrence_rule,
  recurrence_custom_days INTEGER,
  parent_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  checkin_pin TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_group_id ON events(group_id);
CREATE INDEX idx_events_starts_at ON events(starts_at);
CREATE INDEX idx_events_group_date ON events(group_id, starts_at);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_parent ON events(parent_event_id);

-- ==================== EVENT RSVPs ====================

CREATE TABLE event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  response rsvp_response NOT NULL DEFAULT 'yes',
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, membership_id)
);

CREATE INDEX idx_event_rsvps_event ON event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_membership ON event_rsvps(membership_id);

-- ==================== EVENT ATTENDANCES ====================

CREATE TABLE event_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  status attendance_status NOT NULL DEFAULT 'present',
  checked_in_via checkin_method NOT NULL DEFAULT 'manual',
  checked_in_at TIMESTAMPTZ DEFAULT now(),
  marked_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, membership_id)
);

CREATE INDEX idx_event_attendances_event ON event_attendances(event_id);
CREATE INDEX idx_event_attendances_membership ON event_attendances(membership_id);
CREATE INDEX idx_event_attendances_status ON event_attendances(status);

-- ==================== HOSTING ROSTERS ====================

CREATE TABLE hosting_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Roster',
  name_fr TEXT,
  rotation_type rotation_type NOT NULL DEFAULT 'sequential',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hosting_rosters_group ON hosting_rosters(group_id);
CREATE INDEX idx_hosting_rosters_active ON hosting_rosters(group_id, is_active);

-- ==================== HOSTING ASSIGNMENTS ====================

CREATE TABLE hosting_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id UUID NOT NULL REFERENCES hosting_rosters(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  assigned_date DATE NOT NULL,
  status hosting_status NOT NULL DEFAULT 'upcoming',
  exemption_reason TEXT,
  swapped_with UUID REFERENCES hosting_assignments(id),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hosting_assignments_roster ON hosting_assignments(roster_id);
CREATE INDEX idx_hosting_assignments_membership ON hosting_assignments(membership_id);
CREATE INDEX idx_hosting_assignments_event ON hosting_assignments(event_id);
CREATE INDEX idx_hosting_assignments_date ON hosting_assignments(assigned_date);
CREATE INDEX idx_hosting_assignments_status ON hosting_assignments(status);

-- ==================== HOSTING SWAP REQUESTS ====================

CREATE TABLE hosting_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_assignment_id UUID NOT NULL REFERENCES hosting_assignments(id) ON DELETE CASCADE,
  to_assignment_id UUID NOT NULL REFERENCES hosting_assignments(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  status swap_request_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_swap_requests_status ON hosting_swap_requests(status);

-- ==================== MEETING MINUTES ====================

CREATE TABLE meeting_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT,
  title_fr TEXT,
  content_json JSONB NOT NULL DEFAULT '{}',
  decisions_json JSONB NOT NULL DEFAULT '[]',
  action_items_json JSONB NOT NULL DEFAULT '[]',
  attendees_json JSONB NOT NULL DEFAULT '[]',
  status minutes_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES profiles(id),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id)
);

CREATE INDEX idx_meeting_minutes_group ON meeting_minutes(group_id);
CREATE INDEX idx_meeting_minutes_event ON meeting_minutes(event_id);
CREATE INDEX idx_meeting_minutes_status ON meeting_minutes(status);
CREATE INDEX idx_meeting_minutes_published ON meeting_minutes(group_id, published_at DESC);

-- ==================== TRIGGERS ====================

-- Auto-update updated_at for all new tables
CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_event_rsvps_updated_at
  BEFORE UPDATE ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_event_attendances_updated_at
  BEFORE UPDATE ON event_attendances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_hosting_rosters_updated_at
  BEFORE UPDATE ON hosting_rosters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_hosting_assignments_updated_at
  BEFORE UPDATE ON hosting_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_hosting_swap_requests_updated_at
  BEFORE UPDATE ON hosting_swap_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_meeting_minutes_updated_at
  BEFORE UPDATE ON meeting_minutes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosting_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosting_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosting_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_minutes ENABLE ROW LEVEL SECURITY;

-- Events: members can view, admins/owners can manage
CREATE POLICY "Group members can view events"
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = events.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
  );

CREATE POLICY "Group admins can create events"
  ON events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = events.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group admins can update events"
  ON events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = events.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group admins can delete events"
  ON events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = events.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

-- RSVPs: members can view all, manage own
CREATE POLICY "Group members can view RSVPs"
  ON event_rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      JOIN memberships ON memberships.group_id = events.group_id
      WHERE events.id = event_rsvps.event_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
  );

CREATE POLICY "Members can manage own RSVPs"
  ON event_rsvps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.id = event_rsvps.membership_id
        AND memberships.user_id = auth.uid()
    )
  );

-- Attendance: members can view, admins can manage
CREATE POLICY "Group members can view attendance"
  ON event_attendances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      JOIN memberships ON memberships.group_id = events.group_id
      WHERE events.id = event_attendances.event_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
  );

CREATE POLICY "Group admins can manage attendance"
  ON event_attendances FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      JOIN memberships ON memberships.group_id = events.group_id
      WHERE events.id = event_attendances.event_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

-- Members can check in themselves via QR/PIN
CREATE POLICY "Members can self check-in"
  ON event_attendances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.id = event_attendances.membership_id
        AND memberships.user_id = auth.uid()
    )
    AND event_attendances.checked_in_via IN ('qr', 'pin')
  );

-- Hosting rosters: members can view, admins manage
CREATE POLICY "Group members can view hosting rosters"
  ON hosting_rosters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = hosting_rosters.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
  );

CREATE POLICY "Group admins can manage hosting rosters"
  ON hosting_rosters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = hosting_rosters.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

-- Hosting assignments: members can view, admins manage
CREATE POLICY "Group members can view hosting assignments"
  ON hosting_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hosting_rosters
      JOIN memberships ON memberships.group_id = hosting_rosters.group_id
      WHERE hosting_rosters.id = hosting_assignments.roster_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
  );

CREATE POLICY "Group admins can manage hosting assignments"
  ON hosting_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM hosting_rosters
      JOIN memberships ON memberships.group_id = hosting_rosters.group_id
      WHERE hosting_rosters.id = hosting_assignments.roster_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

-- Swap requests: members can view and create, admins approve
CREATE POLICY "Group members can view swap requests"
  ON hosting_swap_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hosting_assignments
      JOIN hosting_rosters ON hosting_rosters.id = hosting_assignments.roster_id
      JOIN memberships ON memberships.group_id = hosting_rosters.group_id
      WHERE (hosting_assignments.id = hosting_swap_requests.from_assignment_id
        OR hosting_assignments.id = hosting_swap_requests.to_assignment_id)
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create swap requests"
  ON hosting_swap_requests FOR INSERT
  WITH CHECK (
    hosting_swap_requests.requested_by = auth.uid()
  );

CREATE POLICY "Admins can update swap requests"
  ON hosting_swap_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM hosting_assignments
      JOIN hosting_rosters ON hosting_rosters.id = hosting_assignments.roster_id
      JOIN memberships ON memberships.group_id = hosting_rosters.group_id
      WHERE hosting_assignments.id = hosting_swap_requests.from_assignment_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

-- Meeting minutes: members can view published, admins can manage all
CREATE POLICY "Group members can view published minutes"
  ON meeting_minutes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = meeting_minutes.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
    AND (
      meeting_minutes.status = 'published'
      OR EXISTS (
        SELECT 1 FROM memberships
        WHERE memberships.group_id = meeting_minutes.group_id
          AND memberships.user_id = auth.uid()
          AND memberships.role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "Group admins can manage minutes"
  ON meeting_minutes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = meeting_minutes.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );
