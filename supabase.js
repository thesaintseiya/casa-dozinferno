/* LOJAS DOZINFERNO — inicialização do cliente Supabase.
   COMO OBTER AS CREDENCIAIS:
   1. Acesse https://supabase.com e crie um projeto.
   2. Vá em "Settings" (engrenagem) > "API".
   3. Copie "Project URL" e "anon public" key para os campos abaixo. */

const SUPABASE_URL      = 'https://oecrmnfxfatsqlvevxnn.supabase.co'; // <-- COLOQUE SUA URL AQUI
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY3JtbmZ4ZmF0c3FsdmV2eG5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5OTgwNjIsImV4cCI6MjEwOTU3NDA2Mn0.GwqY-v3iMzGZ1uXB20pd6nBDHj_DPpAGojWYH1HSgZk';             // <-- COLOQUE SUA CHAVE ANON AQUI

// Inicializa o cliente oficial do Supabase (window.supabase vem do CDN no index.html)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);