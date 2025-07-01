// index.js (Diperbaiki dengan Fastify)

require('dotenv').config(); // Untuk memuat variabel dari .env
const { Client, GatewayIntentBits } = require('discord.js');
// [DIHAPUS] const express = require('express');
// [DIHAPUS] const bodyParser = require('body-parser');

// [BARU] Impor Fastify dan plugin yang dibutuhkan
const fastify = require('fastify')({ logger: false }); // Ganti ke true jika butuh log detail
const fastifyCors = require('@fastify/cors');

const { createClient } = require('@supabase/supabase-js');

// Inisialisasi Discord Client (Tidak ada perubahan)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Inisialisasi Supabase Client (Tidak ada perubahan)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SUPPORT_CHANNEL_ID = '1377945895148060723';

// [BARU] Inisialisasi Fastify App dan registrasi plugin
// Body parser untuk JSON sudah built-in di Fastify, tidak perlu library tambahan.
fastify.register(fastifyCors, {
    origin: 'http://localhost:3000', // Ganti sesuai origin frontend Anda
    methods: ['GET', 'POST', 'OPTIONS']
});

const PORT = process.env.PORT || 3001;

client.once('ready', () => {
    console.log(`Bot ${client.user.tag} sudah online!`);
});

// [BARU] Route '/' untuk UptimeRobot agar bot tetap aktif 24/7
fastify.get('/', async (request, reply) => {
    reply.send({ status: 'OK', message: 'Bot is alive and ready to receive API calls.' });
});

// 1. API Endpoint untuk Menerima Pesan dari Aplikasi Electron Anda
// [DIUBAH] Menggunakan sintaks Fastify: (request, reply)
fastify.post('/api/new-message', async (request, reply) => {
    const { conversationId, userId, messageId, messageContent, timestamp } = request.body;

    if (!conversationId || !userId || !messageContent) {
        // [DIUBAH] Menggunakan reply.code().send()
        return reply.code(400).send({ error: 'Data tidak lengkap.' });
    }

    console.log(`Pesan diterima dari App untuk User ${userId} di Conversation ${conversationId}: ${messageContent}`);

    try {
        const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
        if (channel) {
            await channel.send(
                `💬 **Pesan Baru dari Aplikasi (User: ${userId})**\n` +
                `**Conversation ID:** \`${conversationId}\`\n` +
                `**Message ID (App):** \`${messageId}\`\n` +
                `**Waktu (App):** ${new Date(timestamp).toLocaleString()}\n` +
                `**Pesan:**\n>>> ${messageContent}\n\n` +
                `🔑 Untuk membalas, gunakan command: \`!balas ${conversationId} [pesan balasan Anda]\` atau reply pesan ini.`
            );
            reply.code(200).send({ message: 'Pesan berhasil diteruskan ke Discord.' });
        } else {
            reply.code(500).send({ error: 'Channel support tidak ditemukan.' });
        }
    } catch (error) {
        console.error('Error meneruskan pesan ke Discord:', error);
        reply.code(500).send({ error: 'Gagal meneruskan pesan ke Discord.' });
    }
});

// 2. Mendengarkan Pesan/Command Balasan dari Tim Support di Discord
// (Tidak ada perubahan di bagian ini)
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.channel.id !== SUPPORT_CHANNEL_ID) return;

    if (message.content.startsWith('!balas')) {
        const args = message.content.split(' ');
        args.shift(); // !balas
        const targetConversationId = args.shift();
        const replyContent = args.join(' ');

        if (!targetConversationId || !replyContent) {
            message.reply('Format command salah. Gunakan: `!balas <conversationId> <pesan balasan>`');
            return;
        }

        console.log(`Support membalas ke Conversation ${targetConversationId}: ${replyContent}`);

        try {
            const { data, error } = await supabase
                .from('messages')
                .insert({
                    conversation_id: targetConversationId,
                    sender_id: message.author.id,
                    sender_type: 'support_agent',
                    content: replyContent
                })
                .select();

            if (error) {
                console.error('Error menyimpan balasan support ke Supabase:', error);
                message.reply('Gagal menyimpan balasan ke database.');
                return;
            }

            console.log('Balasan support berhasil disimpan ke Supabase:', data);
            message.react('✅');

        } catch (dbError) {
            console.error('Error database saat memproses balasan support:', dbError);
            message.reply('Terjadi kesalahan database saat memproses balasan.');
        }
    }
});

// Login Bot ke Discord
client.login(process.env.DISCORD_BOT_TOKEN);

// [BARU] Struktur untuk menjalankan server Fastify
const startServer = async () => {
    try {
        // Penting untuk hosting seperti Glitch/Replit agar listen di semua interface
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`API Bot dengan Fastify berjalan di port ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

startServer();