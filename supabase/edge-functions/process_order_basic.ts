// process_order_basic.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
)

export default async function handler(req: Request) {
  try {
    const body = await req.json()
    
    const { clientId, productIds, quantities } = body
    
    if (!clientId || !productIds || !quantities) {
      return new Response('Missing required fields', { status: 400 })
    }
    
    const orderItems = []
    let totalAmount = 0
    
    for (let i = 0; i < productIds.length; i++) {
      const productId = productIds[i]
      const quantity = quantities[i]
      
      const { data: product } = await supabase
        .from('products')
        .select('id, name, price, stock')
        .eq('id', productId)
        .single()
      
      if (!product) {
        return new Response(`Product ${productId} not found`, { status: 404 })
      }
      
      if (product.stock < quantity) {
        const errorMessage = `Insufficient stock for ${product.name}. Only ${product.stock} units available.`
        await sendWhatsAppMessage(clientId, errorMessage)
        return new Response(errorMessage, { status: 400 })
      }
      
      const itemTotal = product.price * quantity
      totalAmount += itemTotal
      
      orderItems.push({
        product_id: productId,
        product_name: product.name,
        quantity: quantity,
        unit_price: product.price,
        total: itemTotal
      })
    }
    
    const { data: order } = await supabase
      .from('orders')
      .insert({
        client_id: clientId,
        items: orderItems,
        total_amount: totalAmount,
        status: 'pending'
      })
      .select()
      .single()
    
    for (let i = 0; i < productIds.length; i++) {
      const productId = productIds[i]
      const quantity = quantities[i]
      
      await supabase
        .from('products')
        .update({
          stock: supabase.rpc('update_stock', {
            product_id: productId,
            quantity_to_reduce: quantity
          })
        })
        .eq('id', productId)
    }
    
    const confirmationMessage = `✅ Order confirmed!
    
Order ID: ${order.id}
Total: $${totalAmount.toFixed(2)}
Status: Pending
    
Thank you for your purchase! We'll process your order shortly.`
    
    await sendWhatsAppMessage(clientId, confirmationMessage)
    
    return new Response(JSON.stringify({ orderId: order.id }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('Error creating order:', error)
    return new Response('Error creating order', { status: 500 })
  }
}

// Función para enviar mensaje de WhatsApp (inline)
async function sendWhatsAppMessage(clientId: string, message: string) {
  await fetch('https://graph.facebook.com/v17.0/YOUR_PHONE_NUMBER_ID/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('WHATSAPP_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: clientId,
      text: { body: message }
    })
  })
}
