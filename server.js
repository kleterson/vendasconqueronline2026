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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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
    account: {
        name: "DragonGod_BR",
        price: "7K CPS",
        bp: "585+",
        server: "Storm / Myth",
        reborn: "2x Reborn",
        whatsapp: "5511920065761",
        description: "Conta extremamente forte com itens de elite, alta BP e status máximos pronta para qualquer Guild War.",
        mainBanner: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
        gallery: [
            "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop"
        ]
    },
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
            if (parsed.account && !parsed.account.whatsapp) {
                parsed.account.whatsapp = "5511920065761";
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
    if (password === 'admin123') {
        res.json({ success: true, token: 'admin-auth-token-secure' });
    } else {
        res.status(401).json({ success: false, message: 'Senha incorreta!' });
    }
});

// Update Account Details & Handle Uploads
app.post('/api/admin/update', upload.fields([
    { name: 'mainBannerFile', maxCount: 1 },
    { name: 'galleryFiles', maxCount: 10 }
]), async (req, res) => {
    try {
        const store = await getStoreDataFromSupabase();
        const { name, price, bp, server, reborn, whatsapp, description, existingGallery } = req.body;

        if (name !== undefined) store.account.name = name;
        if (price !== undefined) store.account.price = price;
        if (bp !== undefined) store.account.bp = bp;
        if (server !== undefined) store.account.server = server;
        if (reborn !== undefined) store.account.reborn = reborn;
        if (whatsapp !== undefined) store.account.whatsapp = whatsapp;
        if (description !== undefined) store.account.description = description;

        // Handle main banner upload if provided
        if (req.files && req.files['mainBannerFile'] && req.files['mainBannerFile'][0]) {
            store.account.mainBanner = `/uploads/${req.files['mainBannerFile'][0].filename}`;
        }

        // Handle gallery images
        let updatedGallery = [];
        if (existingGallery) {
            updatedGallery = Array.isArray(existingGallery) ? existingGallery : [existingGallery];
        }

        if (req.files && req.files['galleryFiles']) {
            const newUploadedFiles = req.files['galleryFiles'].map(file => `/uploads/${file.filename}`);
            updatedGallery = updatedGallery.concat(newUploadedFiles);
        }

        if (updatedGallery.length > 0) {
            store.account.gallery = updatedGallery;
        }

        await saveStoreDataToSupabase(store);
        res.json({ success: true, message: 'Conta atualizada com sucesso!', data: store });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
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