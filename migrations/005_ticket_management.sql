ALTER TABLE tickets ADD COLUMN priority text NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE tickets ADD COLUMN assignee_id text CHECK (assignee_id IN ('demo-agent-1', 'demo-agent-2'));
ALTER TABLE tickets ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE tickets DROP CONSTRAINT tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));
ALTER TABLE ticket_history DROP CONSTRAINT ticket_history_ticket_id_previous_status_key;
ALTER TABLE ticket_history DROP CONSTRAINT ticket_history_check;
ALTER TABLE ticket_history ADD CONSTRAINT ticket_history_transition_check CHECK (
  (previous_status = 'open' AND status = 'in_progress') OR
  (previous_status = 'in_progress' AND status = 'resolved') OR
  (previous_status = 'resolved' AND status IN ('in_progress', 'closed'))
);
CREATE TABLE ticket_management_history (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  kind text NOT NULL CHECK (kind IN ('priority', 'assignment')),
  previous_value text,
  value text,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 10 AND 2000),
  version integer NOT NULL CHECK (version > 1),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (ticket_id, version),
  CHECK (previous_value IS DISTINCT FROM value),
  CHECK ((kind = 'priority' AND previous_value IS NOT NULL AND value IS NOT NULL
    AND previous_value IN ('low','normal','high','urgent') AND value IN ('low','normal','high','urgent')) OR
    (kind = 'assignment' AND (previous_value IS NULL OR previous_value IN ('demo-agent-1','demo-agent-2'))
    AND (value IS NULL OR value IN ('demo-agent-1','demo-agent-2'))))
);
CREATE INDEX ticket_management_history_ticket_date_idx ON ticket_management_history(ticket_id, changed_at, id);
