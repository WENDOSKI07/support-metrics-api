CREATE TABLE tickets (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  category text NOT NULL CHECK (category IN ('functionality', 'data', 'usage')),
  requester_id text NOT NULL CHECK (char_length(trim(requester_id)) > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status = 'open'),
  created_at timestamptz NOT NULL DEFAULT now()
);
