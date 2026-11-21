-- The decision log is append-only. These triggers enforce it inside the database, so no application
-- bug or direct SQL session can silently rewrite history. (Removing them requires an explicit
-- ALTER TABLE ... DISABLE TRIGGER, which needs table ownership and is itself detectable: the hash
-- chain breaks and `verify` reports it.)
CREATE OR REPLACE FUNCTION approval_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'approval_event is append-only: % is not allowed', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER approval_event_no_update_delete BEFORE UPDATE OR DELETE ON approval_event FOR EACH ROW EXECUTE FUNCTION approval_event_immutable();
--> statement-breakpoint
CREATE TRIGGER approval_event_no_truncate BEFORE TRUNCATE ON approval_event FOR EACH STATEMENT EXECUTE FUNCTION approval_event_immutable();
