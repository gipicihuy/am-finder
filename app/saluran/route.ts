import { NextResponse } from "next/server";

// Link pendek untuk dibagikan: amfinder.web.id/saluran langsung ke Saluran WhatsApp.
// 307 (sementara) supaya tujuan bisa diganti kapan saja tanpa tersangkut cache peramban.
const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb6dsXw6xCSY9sn9aD2r";

export function GET() {
  return NextResponse.redirect(CHANNEL_URL, 307);
}

export const HEAD = GET;
