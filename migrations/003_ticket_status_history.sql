ALTER TABLE tickets DROP CONSTRAINT tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('open', 'in_progress', 'resolved'));

CREATE TABLE ticket_history (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  previous_status text NOT NULL,
  status text NOT NULL,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 10 AND 2000),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((previous_status = 'open' AND status = 'in_progress') OR
         (previous_status = 'in_progress' AND status = 'resolved')),
  UNIQUE (ticket_id, previous_status)
);
CREATE INDEX ticket_history_ticket_date_idx ON ticket_history (ticket_id, changed_at, id);
