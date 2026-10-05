require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const postgres = require('postgres');

// ⚙️ Conexão com o Supabase (PostgreSQL para dados)
const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString, { 
    ssl: 'require',
    family: 4
});

// ⚙️ Cliente Supabase (para o Storage de ficheiros)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
    console.error("ATENÇÃO: Credenciais do Supabase Storage não encontradas nas variáveis de ambiente!");
}

// Testar conexão ao iniciar
async function testarConexao() {
    try {
        const result = await sql`SELECT NOW()`;
        console.log('Conectado ao Supabase (PostgreSQL) com sucesso!', result[0].now);
    } catch (err) {
        console.error('Erro ao conectar ao Supabase:', err.message);
    }
}
testarConexao();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do Multer usando memória temporária para enviar direto ao Supabase Storage
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos de imagem são permitidos!'), false);
        }
    }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const defaultStoreData = {
    storeName: "CONQUER MARKET",
    whatsapp: "5511920065761",
    stockCps: 5000,
    stockGold: 100000000,
    liveOrders: [],
    accounts: [
        {
            id: "1",
            name: "DragonGod_BR",
            classType: "Trojan",
            price: "7K CPS",
            bp: "585+",
            server: "Storm / Myth",
            reborn: "2x Reborn",
            description: "Conta extremamente forte com itens de elite, alta BP e status máximos pronta para qualquer Guild War.",
            mainBanner: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
            gallery: [
                "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop"
            ]
        }
    ],
    reviews: [
        { id: 1, author: "ShadowNinja", rating: 5, comment: "Conta sensacional! Veio com todos os equipamentos descritos e o vendedor transferiu o email super rápido.", date: "Ontem" },
        { id: 2, author: "FireTrojan", rating: 5, comment: "Recomendo demais! Negociação 100% segura e limpa.", date: "Há 3 dias" }
    ]
};

// Funções para ler e salvar direto na tabela do Supabase (store_settings)
async function getStoreDataFromSupabase() {
    try {
        const rows = await sql`SELECT data FROM store_settings WHERE id = 1`;
        if (rows && rows.length > 0 && rows[0].data) {
            let parsed = rows[0].data;
            if (!parsed.accounts) {
                parsed.accounts = defaultStoreData.accounts;
            }
            if (!parsed.whatsapp) {
                parsed.whatsapp = "5511920065761";
            }
            if (parsed.stockCps === undefined) parsed.stockCps = 5000;
            if (parsed.stockGold === undefined) parsed.stockGold = 100000000;
            if (!parsed.liveOrders) parsed.liveOrders = [];
            return parsed;
        }
    } catch (err) {
        console.error("Erro ao ler dados do Supabase:", err);
    }
    return defaultStoreData;
}

async function saveStoreDataToSupabase(data) {
    try {
        await sql`
            INSERT INTO store_settings (id, data) 
            VALUES (1, ${sql.json(data)})
            ON CONFLICT (id) 
            DO UPDATE SET data = ${sql.json(data)}
        `;
    } catch (err) {
        console.error("Erro ao salvar dados no Supabase:", err);
    }
}

// Função para enviar imagem para o Supabase Storage com tratamento rigoroso de erros
async function uploadFileToSupabaseStorage(file) {
    if (!supabase) {
        console.error("Erro: Supabase client não configurado.");
        return null;
    }
    try {
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = Date.now() + '_' + Math.round(Math.random() * 1E9) + '_' + cleanName;
        
        const { error } = await supabase.storage
            .from('uploads')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (error) {
            console.error("Erro detalhado do Supabase Storage:", error.message);
            return null;
        }

        const { data: publicURLData } = supabase.storage
            .from('uploads')
            .getPublicUrl(fileName);

        return publicURLData.publicUrl;
    } catch (err) {
        console.error("Erro crítico ao enviar imagem para o Supabase:", err);
        return null;
    }
}

// Get Store Data
app.get('/api/data', async (req, res) => {
    const data = await getStoreDataFromSupabase();
    res.json(data);
});

// Admin Authentication Route
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === '1992') {
        res.json({ success: true, token: 'admin-auth-token-secure' });
    } else {
        res.status(401).json({ success: false, message: 'Senha incorreta!' });
    }
});

// Save Store Global Settings (Nome da Loja, WhatsApp e Estoques)
app.post('/api/admin/settings', async (req, res) => {
    try {
        const store = await getStoreDataFromSupabase();
        const { storeName, whatsapp, stockCps, stockGold } = req.body;
        if (storeName !== undefined) store.storeName = storeName;
        if (whatsapp !== undefined) store.whatsapp = whatsapp;
        if (stockCps !== undefined) store.stockCps = Number(stockCps);
        if (stockGold !== undefined) store.stockGold = Number(stockGold);

        await saveStoreDataToSupabase(store);
        res.json({ success: true, data: store });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao salvar configurações.' });
    }
});

// Save / Update Specific Account (Painel Admin) com upload direto para o Supabase Storage
app.post('/api/admin/account/save', upload.any(), async (req, res) => {
    try {
        const store = await getStoreDataFromSupabase();
        const { index, name, classType, price, bp, server, reborn, description } = req.body;

        const files = req.files || [];
        let mainBannerUrl = null;
        let newGalleryUrls = [];

        for (const file of files) {
            const fileUrl = await uploadFileToSupabaseStorage(file);
            if (fileUrl) {
                if (file.fieldname === 'mainBannerFile') {
                    mainBannerUrl = fileUrl;
                } else if (file.fieldname === 'galleryFiles') {
                    newGalleryUrls.push(fileUrl);
                }
            }
        }

        let existingGallery = req.body.existingGallery || [];
        if (typeof existingGallery === 'string') {
            existingGallery = [existingGallery];
        }

        const finalGallery = [...existingGallery, ...newGalleryUrls];

        let fallbackBanner = "";
        if (index !== "" && !isNaN(index) && store.accounts[Number(index)]) {
            fallbackBanner = store.accounts[Number(index)].mainBanner || "";
        }

        const accountData = {
            id: index !== "" && !isNaN(index) && store.accounts[Number(index)] ? store.accounts[Number(index)].id : String(Date.now()),
            name,
            classType: classType || 'Trojan',
            price,
            bp,
            server,
            reborn,
            description,
            mainBanner: mainBannerUrl || fallbackBanner,
            gallery: finalGallery.length > 0 ? finalGallery : (fallbackBanner ? [fallbackBanner] : [])
        };

        if (index !== "" && !isNaN(index) && store.accounts[Number(index)]) {
            store.accounts[Number(index)] = accountData;
        } else {
            store.accounts.unshift(accountData);
        }

        await saveStoreDataToSupabase(store);
        res.json({ success: true, message: 'Conta salva com sucesso!', accounts: store.accounts });
    } catch (err) {
        console.error("Erro ao salvar conta:", err);
        res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
});

// Delete Account Route (Admin)
app.delete('/api/admin/account/:index', async (req, res) => {
    try {
        const index = Number(req.params.index);
        const store = await getStoreDataFromSupabase();
        if (store.accounts && store.accounts[index]) {
            store.accounts.splice(index, 1);
            await saveStoreDataToSupabase(store);
        }
        res.json({ success: true, accounts: store.accounts });
    } catch (err) {
        console.error("Erro ao excluir conta:", err);
        res.status(500).json({ success: false, message: 'Erro ao excluir conta.' });
    }
});

// Add Review Route
app.post('/api/reviews', async (req, res) => {
    try {
        const { author, rating, comment } = req.body;
        if (!author || !comment || !rating) {
            return res.status(400).json({ success: false, message: 'Preencha todos os campos.' });
        }

        const store = await getStoreDataFromSupabase();
        const newReview = {
            id: Date.now(),
            author: author.trim(),
            rating: Number(rating),
            comment: comment.trim(),
            date: "Hoje"
        };

        store.reviews.unshift(newReview);
        await saveStoreDataToSupabase(store);
        res.json({ success: true, reviews: store.reviews });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao salvar avaliação.' });
    }
});

// Delete Review Route (Admin)
app.delete('/api/reviews/:id', async (req, res) => {
    try {
        const reviewId = Number(req.params.id);
        const store = await getStoreDataFromSupabase();
        store.reviews = store.reviews.filter(r => r.id !== reviewId);
        await saveStoreDataToSupabase(store);
        res.json({ success: true, reviews: store.reviews });
    } catch (err) {
        console.error("Erro ao excluir avaliação:", err);
        res.status(500).json({ success: false, message: 'Erro ao excluir avaliação.' });
    }
});

// Rota para simular pagamento e atualizar o estoque/painel administrativo automaticamente
app.post('/api/simular-pagamento', async (req, res) => {
    try {
        const store = await getStoreDataFromSupabase();
        
        const accId = req.body.accId || "260001592659";
        const itemTitle = req.body.itemTitle || "1000 CPs";
        const quantitySold = Number(req.body.quantity) || 1000;
        const isGold = req.body.isGold || false;

        if (isGold) {
            store.stockGold = Math.max(0, (store.stockGold || 0) - quantitySold);
        } else {
            store.stockCps = Math.max(0, (store.stockCps || 0) - quantitySold);
        }

        if (!store.liveOrders) store.liveOrders = [];
        store.liveOrders.unshift({
            id: Date.now(),
            accId: accId,
            itemTitle: itemTitle,
            date: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });

        await saveStoreDataToSupabase(store);

        res.json({ 
            success: true, 
            message: "Pagamento simulado e estoque atualizado com sucesso!" 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Exemplo de rota no server.js para criar o pagamento Pix
app.post('/api/criar-pagamento', async (req, res) => {
    try {
        const { transaction_amount, description, email } = req.body;

        const response = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': Date.now().toString()
            },
            body: JSON.stringify({
                transaction_amount: Number(transaction_amount),
                description: description,
                payment_method_id: 'pix',
                payer: {
                    email: email || 'cliente@email.com'
                }
            })
        });

        const data = await response.json();

        if (data.status === 'pending' || data.point_of_interaction) {
            return res.json({
                success: true,
                payment_id: data.id,
                qr_code: data.point_of_interaction.transaction_data.qr_code,
                qr_code_base64: data.point_of_interaction.transaction_data.qr_code_base64
            });
        } else {
            return res.status(400).json({ success: false, error: data });
        }
    } catch (error) {
        console.error('Erro ao gerar Pix:', error);
        res.status(500).json({ success: false, error: 'Erro interno no servidor' });
    }
});

// Webhook do Mercado Pago
app.post('/api/webhook', async (req, res) => {
    const event = req.body;

    if (event.type === 'payment') {
        const paymentId = event.data.id;

        try {
            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
                }
            });
            const paymentData = await response.json();

            if (paymentData.status === 'approved') {
                const store = await getStoreDataFromSupabase();
                
                const description = paymentData.description || "CPs ou Gold";
                
                if (!store.liveOrders) store.liveOrders = [];
                store.liveOrders.unshift({
                    id: Date.now(),
                    accId: paymentData.external_reference || "ID Vinculado",
                    itemTitle: description,
                    date: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                });

                await saveStoreDataToSupabase(store);
            }
        } catch (error) {
            console.error('Erro ao consultar pagamento:', error);
        }
    }

    res.status(200).send('OK');
});

// Rota para o frontend verificar o status do pagamento via polling
app.get('/api/verificar-pagamento', async (req, res) => {
    try {
        const paymentId = req.query.id;
        if (!paymentId) {
            return res.status(400).json({ success: false, message: 'ID do pagamento não fornecido.' });
        }

        const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
            }
        });

        const paymentData = await response.json();

        if (response.ok) {
            res.json({
                success: true,
                status: paymentData.status
            });
        } else {
            res.status(400).json({ success: false, error: paymentData });
        }
    } catch (error) {
        console.error('Erro ao verificar status do pagamento:', error);
        res.status(500).json({ success: false, error: 'Erro interno ao verificar pagamento' });
    }
});

// Rota corrigida para limpar o histórico de pedidos no Supabase sem afetar contas, fotos ou estoque
app.post('/api/admin/clear-orders', async (req, res) => {
    try {
        const store = await getStoreDataFromSupabase();
        
        // Esvazia apenas o array de histórico de pedidos aprovados
        store.liveOrders = [];

        // Guarda de volta no Supabase preservando todo o resto
        await saveStoreDataToSupabase(store);

        res.json({ success: true, message: "Histórico de IDs limpo com sucesso!" });
    } catch (err) {
        console.error("Erro ao limpar pedidos:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Conquer Marketplace rodando na porta ${PORT} com Supabase total!`);
});