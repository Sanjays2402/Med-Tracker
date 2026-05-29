import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ ok: true, endpoint: 'csrf' }); }
export async function POST() { return NextResponse.json({ ok: true, endpoint: 'csrf', received: true }); }
