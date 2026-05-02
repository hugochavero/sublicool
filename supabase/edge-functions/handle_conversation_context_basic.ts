// handle_conversation_context_basic.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
)

export default async function handler(req: Request) {
  try {
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
    
  } catch (error) {
    console.error('Error handling conversation context:', error)
    return new Response('Error handling conversation', { status: 500 })
  }
}
