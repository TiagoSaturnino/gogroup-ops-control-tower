import { NextResponse } from 'next/server';
import { dashboard } from '@/lib/tools';
import type { Order } from '@/lib/engine';
import { BUSINESS } from '@/lib/params';
export async function GET(request: Request) {
 const url=new URL(request.url), capacity=Number(url.searchParams.get('capacidade')??BUSINESS.dailyCapacity), params={capacidadeDiaria:Number.isFinite(capacity)?Math.max(1,Math.floor(capacity)):BUSINESS.dailyCapacity,probAbandonoPagamento:Number(url.searchParams.get('probAbandono')??BUSINESS.paymentAbandonmentProbability),tetoRuptura:Number(url.searchParams.get('tetoRuptura')??BUSINESS.stockoutRiskFloor)};
 return NextResponse.json(dashboard(undefined,params));
}
export async function POST(request: Request) {
 try { const body=await request.json() as {orders?:Order[];pedidos?:Order[]}; const orders=body.orders??body.pedidos; if(!Array.isArray(orders)) return NextResponse.json({error:'Envie orders ou pedidos como array JSON.'},{status:400}); return NextResponse.json(dashboard({orders})); }
 catch { return NextResponse.json({error:'JSON inválido.'},{status:400}); }
}

