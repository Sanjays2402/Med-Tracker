import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ ok: true, endpoint: 'session' }); }
export async function POST() { return NextResponse.json({ ok: true, endpoint: 'session', received: true }); }
