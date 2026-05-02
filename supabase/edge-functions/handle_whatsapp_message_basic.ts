// handle_whatsapp_message_basic.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
)

export default async function handler(req: Request) {
  try {
    const body = await req.json()
    
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    const clientId = message?.from
    const userMessage = message?.text?.body?.toLowerCase()
    
    if (!clientId || !userMessage) {
      return new Response('Invalid message format', { status: 400 })
    }
    
    const responseMessage = await processUserMessage(userMessage, clientId)
    
    // Enviar mensaje de WhatsApp
    await sendWhatsAppMessage(clientId, responseMessage)
    
    return new Response('OK', { status: 200 })
    
  } catch (error) {
    console.error('Error processing WhatsApp message:', error)
    return new Response('Error processing message', { status: 500 })
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

// Funciones de ayuda
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
