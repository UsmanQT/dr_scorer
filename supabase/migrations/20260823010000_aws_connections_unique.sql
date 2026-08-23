-- Backstop the application-level duplicate check in the connect API route:
-- one connection per (user, role_arn) pair.
create unique index if not exists aws_connections_user_role_arn_key
  on aws_connections (user_id, role_arn);
