import nodemailer from 'nodemailer';

const senderEmail = process.env.MESSAGE_SENDER;
const senderPassword = process.env.MESSAGE_SENDER_APP_PASSWORD;

let transporter;

async function setupTransporter() {
  if (!senderEmail || !senderPassword) {
    throw new Error('Missing MESSAGE_SENDER or MESSAGE_SENDER_APP_PASSWORD env vars');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true' ? true : false,
      auth: {
        user: senderEmail,
        pass: senderPassword,
      },
      tls: {
        ciphers: 'SSLv3',
      },
    });
    await transporter.verify();
    console.info('[mailer] Transporter verified for', senderEmail);
  }
  return transporter;
}

export async function sendMail({ to, subject, html }) {
  const transport = await setupTransporter();
  const result = await transport.sendMail({
    from: `"Pepper Security" <${senderEmail}>`,
    to,
    subject,
    html,
  });
  console.info('[mailer] Email sent', { to, messageId: result.messageId });
  return result;
}


