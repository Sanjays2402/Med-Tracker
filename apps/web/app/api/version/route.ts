import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ ok: true, endpoint: 'version' }); }
export async function POST() { return NextResponse.json({ ok: true, endpoint: 'version', received: true }); }
