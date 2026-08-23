import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  AWS_ACCOUNT_ID_RE,
  buildCloudFormationTemplate,
  buildRoleArn,
  buildTrustPolicy,
  DEFAULT_REGION,
  SCANNER_POLICY_DOCUMENT,
} from "@/utils/aws/scannerRole";

const AWS_REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;

export async function POST(request: Request) {
  const scannerAccountArn = process.env.SCANNER_AWS_ACCOUNT_ARN;
  if (!scannerAccountArn) {
    return NextResponse.json(
      { error: "Server misconfigured: SCANNER_AWS_ACCOUNT_ARN is not set." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { accountAlias?: string; awsAccountId?: string; regions?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const awsAccountId = (body.awsAccountId ?? "").trim();
  if (!AWS_ACCOUNT_ID_RE.test(awsAccountId)) {
    return NextResponse.json(
      { error: "AWS account ID must be exactly 12 digits." },
      { status: 400 }
    );
  }

  const accountAlias = (body.accountAlias ?? "").trim() || null;

  const regionsInput = Array.isArray(body.regions) ? body.regions.map((r) => r.trim()).filter(Boolean) : [];
  const regions = regionsInput.length > 0 ? Array.from(new Set(regionsInput)) : [DEFAULT_REGION];
  const invalidRegion = regions.find((r) => !AWS_REGION_RE.test(r));
  if (invalidRegion) {
    return NextResponse.json({ error: `"${invalidRegion}" is not a valid AWS region.` }, { status: 400 });
  }

  const roleArn = buildRoleArn(awsAccountId);

  // Reuse an existing connection for this AWS account instead of creating a
  // duplicate with a different external_id — a stale duplicate would make
  // "Verify connection" fail against a role the user already deployed.
  const { data: existing, error: existingError } = await supabase
    .from("aws_connections")
    .select()
    .eq("user_id", user.id)
    .eq("role_arn", roleArn)
    .maybeSingle();

  if (existingError) {
    console.error("aws_connections lookup failed:", existingError);
    return NextResponse.json({ error: "Could not check for an existing connection." }, { status: 500 });
  }

  let data = existing;
  if (!data) {
    const externalId = randomUUID();
    const insertRes = await supabase
      .from("aws_connections")
      .insert({
        user_id: user.id,
        account_alias: accountAlias,
        role_arn: roleArn,
        external_id: externalId,
        regions,
        status: "pending",
      })
      .select()
      .maybeSingle();

    if (insertRes.error || !insertRes.data) {
      console.error("aws_connections insert failed:", insertRes.error);
      return NextResponse.json({ error: "Could not create AWS connection." }, { status: 500 });
    }
    data = insertRes.data;
  }

  return NextResponse.json({
    connection: data,
    reused: Boolean(existing),
    scannerAccountArn,
    policyDocument: SCANNER_POLICY_DOCUMENT,
    trustPolicy: buildTrustPolicy(scannerAccountArn, data.external_id),
    cloudFormationTemplate: buildCloudFormationTemplate(scannerAccountArn, data.external_id),
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("aws_connections")
    .select("id, account_alias, role_arn, external_id, regions, status, last_verified_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("aws_connections list failed:", error);
    return NextResponse.json({ error: "Could not load AWS connections." }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] });
}
