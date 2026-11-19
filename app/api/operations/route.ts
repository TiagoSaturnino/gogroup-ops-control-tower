import { NextResponse } from 'next/server';
import { dashboard } from '@/lib/tools';
import type { Order } from '@/lib/engine';
export async function GET(request: Request) {
 const url=new URL(request.url), params={capacidadeDiaria:Number(url.searchParams.get('capacidade')??150),probAbandonoPagamento:Number(url.searchParams.get('probAbandono')??.3),tetoRuptura:Number(url.searchParams.get('tetoRuptura')??.4)};
 return NextResponse.json(dashboard(undefined,params));
}
export async function POST(request: Request) {
 try { const body=await request.json() as {orders?:Order[];pedidos?:Order[]}; const orders=body.orders??body.pedidos; if(!Array.isArray(orders)) return NextResponse.json({error:'Envie orders ou pedidos como array JSON.'},{status:400}); return NextResponse.json(dashboard({orders})); }
 catch { return NextResponse.json({error:'JSON invÃ¡lido.'},{status:400}); }
}

