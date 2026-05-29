import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ ok: true, endpoint: 'config' }); }
export async function POST() { return NextResponse.json({ ok: true, endpoint: 'config', received: true }); }
