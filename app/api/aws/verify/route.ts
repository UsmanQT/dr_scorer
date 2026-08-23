import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// TODO(Phase 2): once ownership is confirmed below, assume role_arn with
// external_id via @aws-sdk/client-sts, call GetCallerIdentity, then set
// aws_connections.status = 'verified' (or 'error' with a clear reason) and
// last_verified_at = now().
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { connectionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const connectionId = body.connectionId;
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId is required." }, { status: 400 });
  }

  const { data: connection, error } = await supabase
    .from("aws_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !connection) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  return NextResponse.json(
    { error: "Verification is not implemented yet — coming in Phase 2." },
    { status: 501 }
  );
}
