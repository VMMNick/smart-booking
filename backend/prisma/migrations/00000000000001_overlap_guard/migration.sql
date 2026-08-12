-- Defense-in-depth against double-booking, independent of application code.
-- The BookingsService already prevents this with SELECT ... FOR UPDATE inside
-- a transaction, but this constraint guarantees correctness at the DB layer
-- even if that logic is ever bypassed (bug, second app, manual SQL, etc).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Only pending/confirmed bookings are "active" and should block overlaps;
-- cancelled bookings are excluded from the constraint.
ALTER TABLE bookings
  ADD CONSTRAINT overlapping_bookings
  EXCLUDE USING gist (
    room_id WITH =,
    tsrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (status <> 'cancelled');
