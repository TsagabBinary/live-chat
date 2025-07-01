// index.js (Versi Simplified untuk Support yang Mudah)

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fastify = require('fastify')({ logger: false });
const fastifyCors = require('@fastify/cors');
const { createClient } = require('@supabase/supabase-js');

// Inisialisasi Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Inisialisasi Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SUPPORT_CHANNEL_ID = '1377945895148060723';
const PORT = process.env.PORT || 3001;

// Storage untuk menyimpan data pesan sementara (agar mudah reply)
const activeConversations = new Map();

// Inisialisasi Fastify
fastify.register(fastifyCors, {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS']
});

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} sudah online!`);
});

// Route untuk health check
fastify.get('/', async (request, reply) => {
    reply.send({ status: 'OK', message: 'Support Bot is running' });
});

// API untuk menerima pesan baru dari aplikasi
fastify.post('/api/new-message', async (request, reply) => {
    const { conversationId, userId, messageId, messageContent, timestamp, userInfo } = request.body;

    if (!conversationId || !userId || !messageContent) {
        return reply.code(400).send({ error: 'Data tidak lengkap' });
    // Command !help
    if (message.content === '!help') {

    try {
        const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
        if (!channel) {
            return reply.code(500).send({ error: 'Channel support tidak ditemukan' });
        }

        // Buat embed yang lebih menarik
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('💬 Pesan Baru dari Customer')
            .addFields(
                { name: '👤 User ID', value: userId, inline: true },
                { name: '🆔 Conversation ID', value: conversationId, inline: true },
                { name: '⏰ Waktu', value: new Date(timestamp).toLocaleString('id-ID'), inline: true },
                { name: '📝 Pesan', value: messageContent, inline: false }
            )
            .setFooter({ text: `Message ID: ${messageId}` })
            .setTimestamp();

        // Tambahkan info user jika ada
        if (userInfo) {
            embed.addFields({ name: '📋 Info User', value: userInfo, inline: false });
        }

        // Tombol untuk memudahkan reply
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`quick_reply_${conversationId}`)
                    .setLabel('💬 Quick Reply')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`close_ticket_${conversationId}`)
                    .setLabel('✅ Tutup Tiket')
                    .setStyle(ButtonStyle.Success)
            );

        const sentMessage = await channel.send({ 
            embeds: [embed], 
            components: [row] 
        });

        // Simpan data untuk memudahkan reply
        activeConversations.set(conversationId, {
            userId,
            messageId: sentMessage.id,
            timestamp: new Date(timestamp),
            lastActivity: new Date()
        });

        console.log(`📨 Pesan baru dari User ${userId} di Conversation ${conversationId}`);
        reply.code(200).send({ message: 'Pesan berhasil diterima' });

    } catch (error) {
        console.error('❌ Error:', error);
        reply.code(500).send({ error: 'Gagal memproses pesan' });
    }
});

// Mendengarkan interaksi button
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, conversationId] = interaction.customId.split('_');
    
    if (action === 'quick' && interaction.customId.includes('reply')) {
        // Buat modal untuk quick reply
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        
        const modal = new ModalBuilder()
            .setCustomId(`reply_modal_${conversationId}`)
            .setTitle('Quick Reply');

        const replyInput = new TextInputBuilder()
            .setCustomId('reply_content')
            .setLabel('Pesan Balasan')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ketik balasan Anda di sini...')
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(replyInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    }
    
    if (action === 'close' && interaction.customId.includes('ticket')) {
        // Tutup tiket
        activeConversations.delete(conversationId);
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Tiket Ditutup')
            .setDescription(`Conversation ${conversationId} telah ditutup oleh ${interaction.user.tag}`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
});

// Mendengarkan submit modal
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId.startsWith('reply_modal_')) {
        const conversationId = interaction.customId.replace('reply_modal_', '');
        const replyContent = interaction.fields.getTextInputValue('reply_content');

        await sendReplyToDatabase(conversationId, interaction.user.id, replyContent, interaction);
    }
});

// Mendengarkan pesan biasa (untuk command !balas yang simple)
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.channel.id !== SUPPORT_CHANNEL_ID) return;

    // Command !balas yang lebih simple
    if (message.content.startsWith('!balas')) {
        const args = message.content.split(' ');
        const conversationId = args[1];
        const replyContent = args.slice(2).join(' ');

        if (!conversationId || !replyContent) {
            const helpEmbed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('ℹ️ Cara Menggunakan Command')
                .setDescription('**Format:** `!balas <conversationId> <pesan>`\n\n**Contoh:** `!balas 12345 Terima kasih atas laporannya, kami akan segera menindaklanjuti.`')
                .addFields(
                    { name: '💡 Tips', value: 'Gunakan tombol **Quick Reply** untuk cara yang lebih mudah!' }
                );
            
            message.reply({ embeds: [helpEmbed] });
            return;
        }

        await sendReplyToDatabase(conversationId, message.author.id, replyContent, message);
    }

    // Command !list untuk melihat conversation aktif
    if (message.content === '!list') {
        if (activeConversations.size === 0) {
            message.reply('📭 Tidak ada conversation aktif saat ini.');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📋 Conversation Aktif')
            .setDescription('Berikut adalah daftar conversation yang sedang aktif:');

        let description = '';
        activeConversations.forEach((data, convId) => {
            const timeDiff = Math.floor((new Date() - data.lastActivity) / (1000 * 60));
            description += `\n🆔 **${convId}** - User: ${data.userId} (${timeDiff} menit lalu)`;
        });

        embed.setDescription(description || 'Tidak ada conversation aktif.');
        message.reply({ embeds: [embed] });
    }

    // Command !debug untuk debugging database
    if (message.content === '!debug') {
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            message.reply('❌ Command ini hanya untuk administrator.');
            return;
        }

        const debugEmbed = new EmbedBuilder()
            .setColor('#ffff00')
            .setTitle('🔧 Debug Information')
            .addFields(
                { name: '🔗 Supabase URL', value: supabaseUrl ? '✅ Set' : '❌ Not Set', inline: true },
                { name: '🔑 Supabase Key', value: supabaseAnonKey ? '✅ Set' : '❌ Not Set', inline: true },
                { name: '💾 Active Conversations', value: activeConversations.size.toString(), inline: true }
            );

        // Test koneksi database
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('id')
                .limit(1);

            if (error) {
                debugEmbed.addFields({ name: '🔴 Database Test', value: `Error: ${error.message}`, inline: false });
            } else {
                debugEmbed.addFields({ name: '🟢 Database Test', value: 'Connection OK', inline: false });
            }
        } catch (testError) {
            debugEmbed.addFields({ name: '🔴 Database Test', value: `Exception: ${testError.message}`, inline: false });
        }

        message.reply({ embeds: [debugEmbed] });
    }
        const helpEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🤖 Bantuan Support Bot')
            .setDescription('Berikut adalah command yang tersedia:')
            .addFields(
                { name: '💬 !balas <id> <pesan>', value: 'Membalas pesan customer', inline: false },
                { name: '📋 !list', value: 'Melihat conversation aktif', inline: false },
                { name: '❓ !help', value: 'Melihat bantuan ini', inline: false },
                { name: '💡 Tips', value: 'Gunakan tombol **Quick Reply** untuk cara yang lebih mudah dan cepat!', inline: false }
            );

        message.reply({ embeds: [helpEmbed] });
    }
});

// Fungsi untuk mengirim balasan ke database dengan error handling yang lebih baik
async function sendReplyToDatabase(conversationId, supporterId, replyContent, interaction) {
    console.log(`🔄 Mencoba mengirim balasan ke database...`);
    console.log(`📊 Data: ConvID=${conversationId}, SupporterID=${supporterId}, Content=${replyContent.substring(0, 50)}...`);
    
    try {
        // Validasi input
        if (!conversationId || !supporterId || !replyContent) {
            throw new Error('Data tidak lengkap untuk menyimpan ke database');
        }

        // Cek koneksi Supabase
        const { data: testData, error: testError } = await supabase
            .from('messages')
            .select('id')
            .limit(1);

        if (testError) {
            console.error('❌ Koneksi Supabase gagal:', testError);
            throw new Error(`Koneksi database gagal: ${testError.message}`);
        }

        // Prepare data dengan timestamp
        const messageData = {
            conversation_id: conversationId,
            sender_id: supporterId,
            sender_type: 'support_agent',
            content: replyContent,
            created_at: new Date().toISOString()
        };

        console.log('📝 Data yang akan disimpan:', messageData);

        // Insert ke database
        const { data, error } = await supabase
            .from('messages')
            .insert(messageData)
            .select();

        if (error) {
            console.error('❌ Error saat insert:', error);
            console.error('❌ Error details:', JSON.stringify(error, null, 2));
            
            // Buat pesan error yang lebih informatif
            let errorMsg = 'Gagal menyimpan balasan ke database.';
            if (error.code) {
                errorMsg += ` (Error Code: ${error.code})`;
            }
            if (error.details) {
                errorMsg += ` Detail: ${error.details}`;
            }
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Database Error')
                .addFields(
                    { name: '🆔 Conversation ID', value: conversationId, inline: true },
                    { name: '👤 Support Agent', value: `<@${supporterId}>`, inline: true },
                    { name: '🔴 Error', value: errorMsg, inline: false },
                    { name: '📝 Pesan (Backup)', value: replyContent.substring(0, 1000), inline: false }
                )
                .setFooter({ text: 'Pesan disimpen sementara. Coba lagi atau hubungi admin.' })
                .setTimestamp();
            
            if (interaction.isModalSubmit?.()) {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed] });
            }
            return;
        }

        // Berhasil menyimpan
        console.log('✅ Balasan berhasil disimpan:', data);

        // Update last activity
        if (activeConversations.has(conversationId)) {
            activeConversations.get(conversationId).lastActivity = new Date();
        }

        // Buat embed konfirmasi
        const confirmEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Balasan Berhasil Terkirim')
            .addFields(
                { name: '🆔 Conversation ID', value: conversationId, inline: true },
                { name: '👤 Support Agent', value: `<@${supporterId}>`, inline: true },
                { name: '📝 Pesan', value: replyContent.length > 500 ? replyContent.substring(0, 500) + '...' : replyContent, inline: false },
                { name: '🕐 Waktu', value: new Date().toLocaleString('id-ID'), inline: true }
            )
            .setFooter({ text: `Message ID: ${data[0]?.id || 'Unknown'}` })
            .setTimestamp();

        if (interaction.isModalSubmit?.()) {
            await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
        } else {
            await interaction.react('✅');
            await interaction.reply({ embeds: [confirmEmbed] });
        }

    } catch (dbError) {
        console.error('❌ Unexpected database error:', dbError);
        console.error('❌ Stack trace:', dbError.stack);
        
        // Buat pesan error yang user-friendly
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Terjadi Kesalahan')
            .addFields(
                { name: '🆔 Conversation ID', value: conversationId, inline: true },
                { name: '👤 Support Agent', value: `<@${supporterId}>`, inline: true },
                { name: '🔴 Error', value: dbError.message || 'Unknown error', inline: false },
                { name: '📝 Pesan (Backup)', value: replyContent.substring(0, 1000), inline: false }
            )
            .setDescription('Silakan coba lagi atau hubungi administrator. Pesan Anda telah dicatat.')
            .setTimestamp();
        
        if (interaction.isModalSubmit?.()) {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [errorEmbed] });
        }
    }
}

// Login Bot
client.login(process.env.DISCORD_BOT_TOKEN);

// Start Fastify Server
const startServer = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`🚀 Support Bot API berjalan di port ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

startServer();
