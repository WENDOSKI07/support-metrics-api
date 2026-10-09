CREATE TABLE ticket_comments (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  author_id text NOT NULL CHECK (char_length(trim(author_id)) > 0),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ticket_comments_ticket_date_idx ON ticket_comments (ticket_id, created_at, id);
