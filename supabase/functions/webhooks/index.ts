// main_edge_function.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
)

export default async function handler(req: Request) {
  const { method } = req;

  // --- 1. MANEJO DE VERIFICACIÓN (Petición GET de Meta) ---
  if (method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Este es el token que tú elijas y pongas en el portal de Meta Developers
    const VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN') || "tu_token_secreto_aqui";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return new Response(challenge, { status: 200 });
    } else {
      return new Response("Forbidden", { status: 403 });
    }
  }
  
  try {
    const body = await req.json()
    
    // Handle WhatsApp webhook events
    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry
      for (const entry of entries) {
        const changes = entry.changes
        for (const change of changes) {
          const message = change.value.messages?.[0]
          if (message) {
            const clientId = message.from
            const userMessage = message.text?.body?.toLowerCase()
            
            if (!clientId || !userMessage) {
              return new Response('Invalid message format', { status: 400 })
            }
            
            // Save conversation context
            await supabase.from('conversations').insert({
              client_id: clientId,
              message: userMessage,
              timestamp: new Date(),
              context: {}
            })
            
            // Process the message
            const responseMessage = await processUserMessage(userMessage, clientId)
            
            // Send WhatsApp response
            await sendWhatsAppMessage(clientId, responseMessage)
          }
        }
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // Handle direct API requests for conversation context
    if (req.url.includes('/conversation')) {
      const { clientId, message, context } = await req.json()
      
      if (!clientId || !message) {
        return new Response('Client ID and message are required', { status: 400 })
      }
      
      await supabase.from('conversations').insert({
        client_id: clientId,
        message: message,
        timestamp: new Date(),
        context: context || {}
      })
      
      return new Response('Conversation saved successfully', { status: 200 })
    }
    
    // Handle order processing
    if (req.url.includes('/order')) {
      const { clientId, productIds, quantities } = await req.json()
      
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
    }
    
    // Handle product details request
    if (req.url.includes('/product')) {
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
    }
    
    return new Response('Invalid endpoint', { status: 400 })
    
  } catch (error) {
    console.error('Error in WhatsApp webhook handler:', error)
    return new Response('Error processing request', { status: 500 })
  }
}

async function processUserMessage(userMessage: string, clientId: string): Promise<string> {
  if (isGreeting(userMessage)) {
    return getGreetingResponse(clientId)
  } else if (isCatalogRequest(userMessage)) {
    return await getCatalogResponse(clientId)
  } else if (isProductSearch(userMessage)) {
    return await searchProductResponse(userMessage)
  } else if (isOrderRequest(userMessage)) {
    return getOrderResponse()
  } else {
    return getDefaultResponse()
  }
}

// Helper functions
function isGreeting(message: string): boolean {
  const greetings = ['hola', 'hello', 'hi', 'buenos días', 'buenas tardes', 'buenas noches']
  return greetings.some(greeting => message.includes(greeting))
}

function isCatalogRequest(message: string): boolean {
  const catalogKeywords = ['catálogo', 'catalogo', 'ver productos', 'productos', 'catalog']
  return catalogKeywords.some(keyword => message.includes(keyword))
}

function isProductSearch(message: string): boolean {
  const searchKeywords = ['buscar', 'busco', 'quiero', 'necesito']
  return searchKeywords.some(keyword => message.includes(keyword))
}

function isOrderRequest(message: string): boolean {
  const orderKeywords = ['orden', 'comprar', 'pedido', 'compra', 'quiero comprar']
  return orderKeywords.some(keyword => message.includes(keyword))
}

function getGreetingResponse(clientId: string): string {
  return `👋 Hello! I'm your sales assistant. How can I help you today?
  
  🛍️ Options:
  1. View catalog
  2. Search for products
  3. Place an order
  4. Help / FAQ
  
  Please reply with the number of your choice or tell me what you're looking for.`
}

async function getCatalogResponse(clientId: string): Promise<string> {
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price, stock')
    .eq('active', true)
    .limit(5)
  
  if (!products || products.length === 0) {
    return "Our catalog is currently empty. Please check back later."
  }
  
  let catalogMessage = "🛍️ Here are our available products:\n\n"
  
  products.forEach((product: any, index: number) => {
    catalogMessage += `${index + 1}. ${product.name} - $${product.price} (${product.stock} in stock)\n`
  })
  
  catalogMessage += "\nReply with the product name or number to get more details!"
  
  return catalogMessage
}

async function searchProductResponse(userMessage: string): Promise<string> {
  const searchTerm = userMessage.replace(/buscar|busco|quiero|necesito/g, '').trim()
  
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price, stock, description')
    .ilike('name', `%${searchTerm}%`)
    .eq('active', true)
    .limit(3)
  
  if (!products || products.length === 0) {
    return `I couldn't find any products matching "${searchTerm}". Try another search term.`
  }
  
  let searchResults = `🔍 Found ${products.length} products:\n\n`
  
  products.forEach((product: any, index: number) => {
    searchResults += `${index + 1}. ${product.name} - $${product.price}\n`
    searchResults += `   ${product.description}\n`
    searchResults += `   Stock: ${product.stock} units\n\n`
  })
  
  searchResults += "Reply with the product name to get more details or 'order' to purchase!"
  
  return searchResults
}

function getOrderResponse(): string {
  return "To place an order, please tell me which product you'd like to buy and how many units. For example: 'I want 2 smartphones'."
}

function getDefaultResponse(): string {
  return "Thanks for your message! I'm here to help you find products and place orders. You can:\n\n" +
         "• Ask to see our catalog\n" +
         "• Search for specific products\n" +
         "• Place an order\n\n" +
         "What would you like to do?"
}

// WhatsApp message sending function
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
