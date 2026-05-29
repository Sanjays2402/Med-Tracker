import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ ok: true, endpoint: 'newsletter' }); }
export async function POST() { return NextResponse.json({ ok: true, endpoint: 'newsletter', received: true }); }
