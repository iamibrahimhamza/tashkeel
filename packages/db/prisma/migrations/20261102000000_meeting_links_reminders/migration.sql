-- The expert's standing meeting link for a service; copied onto each booking when it is confirmed.
ALTER TABLE "Service" ADD COLUMN "meetingUrl" TEXT;

-- Session reminders scan confirmed bookings by start time.
CREATE INDEX "Booking_status_startsAt_idx" ON "Booking"("status", "startsAt");
