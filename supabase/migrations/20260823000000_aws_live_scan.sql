-- AWS Live-Scan integration
-- Adds connection metadata, scan runs, and per-resource findings.
-- Credentials are never stored: only role_arn + external_id, which together
-- with the scanner's own AWS identity are required to assume the role.

create table if not exists aws_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  account_alias text,
  role_arn text not null,
  external_id text not null,
  regions text[] not null default '{us-east-1}',
  status text not null default 'pending' check (status in ('pending', 'verified', 'error')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references aws_connections (id) on delete cascade not null,
  user_id uuid references auth.users not null,
  status text not null default 'running' check (status in ('running', 'complete', 'failed')),
  overall_score numeric,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans (id) on delete cascade not null,
  category text not null check (category in ('backup', 'multi_az', 'replication', 'failover', 'monitoring')),
  resource_type text not null,
  resource_id text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'pass', 'unknown')),
  title text not null,
  detail text,
  remediation text,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists aws_connections_user_id_idx on aws_connections (user_id);
create index if not exists scans_user_id_idx on scans (user_id);
create index if not exists scans_connection_id_idx on scans (connection_id);
create index if not exists findings_scan_id_idx on findings (scan_id);

alter table aws_connections enable row level security;
alter table scans enable row level security;
alter table findings enable row level security;

-- aws_connections: direct user_id ownership
create policy "aws_connections_select_own" on aws_connections
  for select using (user_id = auth.uid());
create policy "aws_connections_insert_own" on aws_connections
  for insert with check (user_id = auth.uid());
create policy "aws_connections_update_own" on aws_connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "aws_connections_delete_own" on aws_connections
  for delete using (user_id = auth.uid());

-- scans: direct user_id ownership
create policy "scans_select_own" on scans
  for select using (user_id = auth.uid());
create policy "scans_insert_own" on scans
  for insert with check (user_id = auth.uid());
create policy "scans_update_own" on scans
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "scans_delete_own" on scans
  for delete using (user_id = auth.uid());

-- findings: ownership via parent scan
create policy "findings_select_own" on findings
  for select using (
    exists (select 1 from scans s where s.id = findings.scan_id and s.user_id = auth.uid())
  );
create policy "findings_insert_own" on findings
  for insert with check (
    exists (select 1 from scans s where s.id = findings.scan_id and s.user_id = auth.uid())
  );
create policy "findings_update_own" on findings
  for update using (
    exists (select 1 from scans s where s.id = findings.scan_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from scans s where s.id = findings.scan_id and s.user_id = auth.uid())
  );
create policy "findings_delete_own" on findings
  for delete using (
    exists (select 1 from scans s where s.id = findings.scan_id and s.user_id = auth.uid())
  );
