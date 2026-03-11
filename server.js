require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

// Simulación de credenciales de API (En producción, usa variables de entorno .env)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_12345_simulation_key";
const BINANCE_PAY_API_KEY = process.env.BINANCE_PAY_API_KEY || "binance_pay_simulation_key";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Servir archivos estáticos (index.html, postulacion.html, etc.)

// Configuración de Email del Usuario (Outlook)
const EMAIL_USER = process.env.EMAIL_USER || "lizste.hidalgo@hotmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS;

// Configurar el transportador de Nodemailer para Outlook
const transporter = nodemailer.createTransport({
    host: "smtp-mail.outlook.com",
    port: 587,
    secure: false, // TLS
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
    tls: {
                ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});

// Endpoint de salud para verificación desde el frontend
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: "online",
        account: EMAIL_USER,
        version: "1.0.1"
    });
});

// ==========================================
// 1. PASARELA DE PAGOS FIAT (Stripe)
// ==========================================
app.post('/api/deposit/fiat', async (req, res) => {
    try {
        const { amountUSD, userId } = req.body;
        if (!amountUSD || amountUSD < 50) {
            return res.status(400).json({ error: "Monto mínimo $50 USD." });
        }
        res.json({
            success: true,
            provider: "Stripe",
            checkoutUrl: "https://checkout.stripe.com/pay/cs_test_simulacion_123",
            message: "Sesión de pago Stripe creada."
        });
    } catch (error) {
        res.status(500).json({ error: "Error en pasarela FIAT." });
    }
});

// ==========================================
// 2. PASARELA DE CRIPTOMONEDAS (Binance Pay)
// ==========================================
app.post('/api/deposit/crypto', async (req, res) => {
    try {
        const { amount, asset = 'USDT' } = req.body;
        res.json({
            success: true,
            provider: "Binance Pay",
            qrData: `binancepay://request_payment?amount=${amount}&currency=${asset}`,
            message: "Orden de pago Binance Pay generada."
        });
    } catch (error) {
        res.status(500).json({ error: "Error en pasarela Crypto." });
    }
});

// ==========================================
// 3. MOTOR DE AUTOMATIZACIÓN DE POSTULACIONES
// ==========================================
app.post('/api/apply/job', async (req, res) => {
    try {
        const { company, position, profileType, emailTarget } = req.body;

        const profiles = {
            qc: {
                title: "Analista de Control de Calidad / Aseguramiento de Calidad",
                body: `Estimados señores del equipo de Selección de ${company},\n\nEs un gusto saludarles. Me pongo en contacto con mucha ilusión para postularme a la vacante de ${position}.\n\nSoy Biotecnóloga y he dedicado mi formación a perfeccionar mi rigor técnico en normativas BPM y HACCP. Me considero una persona sumamente detallista, amable y comprometida con la excelencia.\n\nQuedo a su entera disposición para conversar en una entrevista.\n\nAtentamente,\nLisbeth Hidalgo\nQuito, Ecuador`
            },
            production: {
                title: "Ingeniera de Procesos / Supervisor de Producción",
                body: `Estimados directores de Producción de ${company},\n\nReciban un cordial saludo. Les escribo para presentar mi candidatura al cargo de ${position}.\n\nComo Biotecnóloga con enfoque industrial, disfruto el desafío de optimizar procesos y liderar con empatía y eficiencia.\n\nCordialmente,\nLisbeth Hidalgo\nQuito, Ecuador`
            },
            administrative: {
                title: "Asistente Administrativa / Secretaria Ejecutiva",
                body: `Estimado equipo de Talento Humano de ${company},\n\nReciban un cordial saludo. Me dirijo a ustedes para postularme al cargo de ${position}.\n\nMe caracterizo por ser una persona organizada, extremadamente amable y siempre dispuesta a brindar un excelente soporte administrativo.\n\nMuchas gracias por su atención.\n\nSaludos cordiales,\nLisbeth Hidalgo\nQuito, Ecuador`
            }
        };

        const selectedProfile = profiles[profileType] || profiles.qc;
        let finalMessage = selectedProfile.body;
        let deliveryStatus = "Enviado Real";
        let isSimulation = false;
        let errorDetail = "";

        if (emailTarget) {
            // VERIFICACIÓN CRÍTICA DE CREDENCIALES
            if (!EMAIL_PASS || EMAIL_PASS === 'tu_contrasena_de_aplicacion_aqui' || EMAIL_PASS === '') {
                console.log("⚠️ [SIMULACIÓN] No se envió correo porque EMAIL_PASS no está configurado en .env");
                deliveryStatus = "Simulación (Faltan Credenciales)";
                isSimulation = true;
            } else {
                try {
                    await transporter.sendMail({
                        from: `"Lisbeth Hidalgo" <${EMAIL_USER}>`,
                        to: emailTarget,
                        subject: `Postulación para ${position} - Lisbeth Hidalgo`,
                        text: finalMessage
                    });
                    console.log(`✅ [OK] Correo enviado a ${emailTarget}`);
                } catch (mailError) {
                    console.error("❌ [SMTP ERROR]:", mailError.message);
                    deliveryStatus = "Error de Autenticación / Red";
                    errorDetail = mailError.message;
                    isSimulation = true; // Lo tratamos como fallido/simulado para el reporte
                }
            }
        }

        res.json({
            success: !isSimulation, // Si falló el envío o es simulación, success es false para avisar al usuario
            status: isSimulation ? "simulated" : "applied",
            adaptedProfile: selectedProfile.title,
            deliveryMethod: deliveryStatus,
            error: errorDetail,
            message: isSimulation 
                ? `¡ATENCIÓN! No se envió el correo real. Razón: ${deliveryStatus}. ${errorDetail}` 
                : `Postulación enviada exitosamente a ${company} (${emailTarget}).`,
            verificationId: "AP-AUTO-" + Math.floor(Math.random() * 1000000)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Error interno del servidor." });
    }
});

// ==========================================
// 4. SINCRONIZACIÓN DE OUTLOOK (Detección de Intervenciones/Entrevistas)
// ==========================================
app.get('/api/outlook/sync', async (req, res) => {
    try {
        // En una implementación real, aquí usaríamos IMAP o Graph API para leer correos.
        // Simularemos la detección de respuestas positivas.
        const mockResponses = [
            { id: 1, from: "RRHH - BioLabs", subject: "Invitación a Entrevista", date: "2024-03-10", importance: "high" },
            { id: 2, from: "Alimentos del Valle", subject: "Consulta de Disponibilidad", date: "2024-03-09", importance: "medium" }
        ];

        res.json({
            success: true,
            account: EMAIL_USER,
            interviewsFound: mockResponses,
            lastSync: new Date().toLocaleString(),
            alerts: 5
        });
    } catch (error) {
        res.status(500).json({ error: "Error sincronizando Outlook." });
    }
});

app.post('/api/webhooks/payment_success', express.raw({ type: 'application/json' }), (req, res) => {
    console.log("[WEBHOOK] Pago confirmado.");
    res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    ================================================
    ✓ SERVIDOR BACKEND (STEFANI AI) EN LÍNEA
    ✓ Puerto: ${PORT}
    ✓ Outlook Sync: Activo (${EMAIL_USER})
    ================================================
    `);
});
