// get_product_details_basic.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
)

export default async function handler(req: Request) {
  try {
    const { productId, clientId } = await req.json()
    
    if (!productId) {
      return new Response('Product ID is required', { status: 400 })
    }
    
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('active', true)
      .single()
    
    if (!product) {
      const errorMessage = 'Product not found or not available'
      await sendWhatsAppMessage(clientId, errorMessage)
      return new Response(errorMessage, { status: 404 })
    }
    
    const productDetails = `
📦 ${product.name}
${product.description}

💰 Price: $${product.price}
📦 Stock: ${product.stock} units

Would you like to add this to your cart?`
    
    await sendWhatsAppMessage(clientId, productDetails)
    
    return new Response(JSON.stringify({ 
      product: productDetails,
      available: product.stock > 0 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('Error getting product details:', error)
    return new Response('Error retrieving product details', { status: 500 })
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
