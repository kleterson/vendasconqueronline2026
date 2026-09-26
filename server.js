require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const postgres = require('postgres');

// ⚙️ Conexão com o Supabase (PostgreSQL via Pooler)
const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString, { 
    ssl: 'require',
    family: 4
});

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

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Setup for Local Image Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Aumentado para 10MB para aceitar fotos de alta qualidade
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
app.use(express.static(path.join(__dirname, 'public')));

const defaultStoreData = {
    storeName: "CONQUER MARKET",
    whatsapp: "5511920065761",
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

// Get Store Data
app.get('/api/data', async (req, res) => {
    const data = await getStoreDataFromSupabase();
    res.json(data);
});

// Admin Authentication Route
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === '2332') {
        res.json({ success: true, token: 'admin-auth-token-secure' });
    } else {
        res.status(401).json({ success: false, message: 'Senha incorreta!' });
    }
});

// Save Store Global Settings (Nome da Loja e WhatsApp)
app.post('/api/admin/settings', async (req, res) => {
    try {
        const store = await getStoreDataFromSupabase();
        const { storeName, whatsapp } = req.body;
        if (storeName !== undefined) store.storeName = storeName;
        if (whatsapp !== undefined) store.whatsapp = whatsapp;

        await saveStoreDataToSupabase(store);
        res.json({ success: true, data: store });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao salvar configurações.' });
    }
});

// Save / Update Specific Account (Painel Admin) com suporte a upload de múltiplas imagens
app.post('/api/admin/account/save', upload.any(), async (req, res) => {
    try {
        const store = await getStoreDataFromSupabase();
        const { index, name, classType, price, bp, server, reborn, description } = req.body;

        // Recolher imagens enviadas por upload
        const files = req.files || [];
        let mainBannerUrl = null;
        let newGalleryUrls = [];

        files.forEach(file => {
            const fileUrl = `/uploads/${file.filename}`;
            if (file.fieldname === 'mainBannerFile') {
                mainBannerUrl = fileUrl;
            } else if (file.fieldname === 'galleryFiles') {
                newGalleryUrls.push(fileUrl);
            }
        });

        // Tratar galeria existente mantida pelo admin
        let existingGallery = req.body.existingGallery || [];
        if (typeof existingGallery === 'string') {
            existingGallery = [existingGallery];
        }

        const finalGallery = [...existingGallery, ...newGalleryUrls];

        const accountData = {
            id: index !== "" && store.accounts[index] ? store.accounts[index].id : String(Date.now()),
            name,
            classType: classType || 'Trojan',
            price,
            bp,
            server,
            reborn,
            description,
            mainBanner: mainBannerUrl || (index !== "" && store.accounts[index] ? store.accounts[index].mainBanner : 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'),
            gallery: finalGallery.length > 0 ? finalGallery : ['https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop']
        };

        if (index !== "" && !isNaN(index) && store.accounts[Number(index)]) {
            // Atualizar conta existente
            store.accounts[Number(index)] = accountData;
        } else {
            // Adicionar nova conta no início da lista
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
        res.status(500).json({ success: false, message: 'Erro ao excluir avaliação.' });
    }
});

app.listen(PORT, () => {
    console.log(`Conquer Marketplace rodando na porta ${PORT} com Supabase PostgreSQL!`);
});