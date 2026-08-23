import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  buildCloudFormationTemplate,
  buildRoleArn,
  buildTrustPolicy,
  SCANNER_POLICY_DOCUMENT,
} from "@/utils/aws/scannerRole";

const AWS_ACCOUNT_ID_RE = /^\d{12}$/;
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
  const regions = regionsInput.length > 0 ? regionsInput : ["us-east-1"];
  const invalidRegion = regions.find((r) => !AWS_REGION_RE.test(r));
  if (invalidRegion) {
    return NextResponse.json({ error: `"${invalidRegion}" is not a valid AWS region.` }, { status: 400 });
  }

  const externalId = randomUUID();
  const roleArn = buildRoleArn(awsAccountId);

  const { data, error } = await supabase
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

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create AWS connection." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    connection: data,
    scannerAccountArn,
    policyDocument: SCANNER_POLICY_DOCUMENT,
    trustPolicy: buildTrustPolicy(scannerAccountArn, externalId),
    cloudFormationTemplate: buildCloudFormationTemplate(scannerAccountArn, externalId),
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] });
}
