ALTER TABLE incidents ADD CONSTRAINT incidents_solution_required CHECK (status <> 'resolved' OR solution IS NOT NULL);
