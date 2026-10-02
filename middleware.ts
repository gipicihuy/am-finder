import { NextRequest, NextResponse } from "next/server";
import { sendLog } from "./lib/track";

export const config = {
  matcher: ["/"],
};

export async function middleware(req: NextRequest) {
  if (req.method === "GET") {
    await sendLog("visit", req.headers, { path: req.nextUrl.pathname });
  }
  return NextResponse.next();
}
