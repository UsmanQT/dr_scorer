import { NextResponse } from "next/server";

// TODO(Phase 2): assume role_arn with external_id via @aws-sdk/client-sts,
// call GetCallerIdentity, then set aws_connections.status = 'verified'
// (or 'error' with a clear reason) and last_verified_at = now().
export async function POST() {
  return NextResponse.json(
    { error: "Verification is not implemented yet — coming in Phase 2." },
    { status: 501 }
  );
}
