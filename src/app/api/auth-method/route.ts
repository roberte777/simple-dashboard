import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    patAvailable: Boolean(process.env.GITHUB_PAT),
  });
}
