CREATE TABLE incidents (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  solution text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status = 'open' AND solution IS NULL) OR (status = 'resolved' AND char_length(btrim(solution)) BETWEEN 10 AND 2000))
);
CREATE INDEX incidents_created_idx ON incidents (created_at DESC, id DESC);
CREATE TABLE ticket_incidents (
  ticket_id uuid PRIMARY KEY REFERENCES tickets(id),
  incident_id uuid NOT NULL REFERENCES incidents(id)
);
CREATE INDEX ticket_incidents_incident_idx ON ticket_incidents (incident_id, ticket_id);
CREATE TABLE incident_history (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  status text NOT NULL CHECK (status IN ('open','resolved')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  version integer NOT NULL CHECK (version > 1),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (incident_id,version)
);
CREATE INDEX incident_history_order_idx ON incident_history (incident_id, changed_at, id);
CREATE TABLE ticket_incident_history (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  previous_incident_id uuid REFERENCES incidents(id),
  incident_id uuid REFERENCES incidents(id),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  version integer NOT NULL CHECK (version > 1),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (previous_incident_id IS DISTINCT FROM incident_id),
  UNIQUE(ticket_id,version)
);
CREATE INDEX ticket_incident_history_order_idx ON ticket_incident_history (ticket_id,changed_at,id);
