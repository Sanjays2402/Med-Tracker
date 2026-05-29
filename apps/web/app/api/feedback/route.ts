import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ ok: true, endpoint: 'feedback' }); }
export async function POST() { return NextResponse.json({ ok: true, endpoint: 'feedback', received: true }); }
